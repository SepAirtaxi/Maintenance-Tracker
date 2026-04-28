import {
  Timestamp,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CsvRow } from "@/lib/csv";
import type { Aircraft } from "@/types";
import { logAudit } from "@/services/audit";
import { formatMinutesAsDuration } from "@/lib/time";
import { formatDate } from "@/lib/format";

export type TailDecision =
  | { action: "pending" }
  | { action: "dismiss" }
  | { action: "create"; model: string };

export type ImportPlan = {
  rowsByTail: Map<string, CsvRow[]>;
  existingAircraft: Map<string, Aircraft>;
  existingEventKeys: Set<string>; // "tail::warning"
  ttafCandidateByTail: Map<string, number>; // minutes, max across eligible rows
  unknownTails: string[];
};

export type ImportSummary = {
  createdAircraft: string[];
  dismissedTails: string[];
  updatedTtaf: Array<{ tailNumber: string; before: number | null; after: number }>;
  skippedTtafStale: Array<{ tailNumber: string; candidate: number; stored: number }>;
  createdEvents: number;
  skippedDuplicateEvents: number;
  skippedForUnknownTail: number;
};

function eventKey(tail: string, warning: string): string {
  return `${tail}::${warning}`;
}

async function fetchAllAircraft(): Promise<Map<string, Aircraft>> {
  const snap = await getDocs(collection(db, "aircraft"));
  const map = new Map<string, Aircraft>();
  snap.forEach((d) => {
    map.set(d.id, d.data() as Aircraft);
  });
  return map;
}

async function fetchAllEventKeys(): Promise<Set<string>> {
  const snap = await getDocs(collection(db, "events"));
  const set = new Set<string>();
  snap.forEach((d) => {
    const data = d.data() as { tailNumber: string; warning: string };
    set.add(eventKey(data.tailNumber, data.warning));
  });
  return set;
}

export async function buildImportPlan(rows: CsvRow[]): Promise<ImportPlan> {
  const rowsByTail = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const arr = rowsByTail.get(row.callSign) ?? [];
    arr.push(row);
    rowsByTail.set(row.callSign, arr);
  }

  const [existingAircraft, existingEventKeys] = await Promise.all([
    fetchAllAircraft(),
    fetchAllEventKeys(),
  ]);

  const ttafCandidateByTail = new Map<string, number>();
  for (const [tail, tailRows] of rowsByTail) {
    let maxCandidate: number | null = null;
    for (const row of tailRows) {
      if (row.logTimeLeftMinutes == null || row.timerExpiryTimeMinutes == null) {
        continue;
      }
      const candidate = row.timerExpiryTimeMinutes - row.logTimeLeftMinutes;
      if (maxCandidate == null || candidate > maxCandidate) {
        maxCandidate = candidate;
      }
    }
    if (maxCandidate != null) {
      ttafCandidateByTail.set(tail, maxCandidate);
    }
  }

  const unknownTails = [...rowsByTail.keys()].filter(
    (tail) => !existingAircraft.has(tail),
  );

  return {
    rowsByTail,
    existingAircraft,
    existingEventKeys,
    ttafCandidateByTail,
    unknownTails,
  };
}

export async function executeImport(
  plan: ImportPlan,
  decisions: Map<string, TailDecision>,
  user: { uid: string; initials: string },
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    createdAircraft: [],
    dismissedTails: [],
    updatedTtaf: [],
    skippedTtafStale: [],
    createdEvents: 0,
    skippedDuplicateEvents: 0,
    skippedForUnknownTail: 0,
  };

  const batch = writeBatch(db);
  const effectiveAircraft = new Map(plan.existingAircraft);

  // 1. Resolve unknown tails
  for (const tail of plan.unknownTails) {
    const decision = decisions.get(tail) ?? { action: "pending" };
    if (decision.action === "create") {
      const ref = doc(db, "aircraft", tail);
      const model = decision.model.trim() || "(unknown)";
      batch.set(ref, {
        tailNumber: tail,
        model,
        airworthy: true,
        totalTimeMinutes: null,
        totalTimeUpdatedAt: null,
        totalTimeUpdatedBy: null,
        totalTimeSource: null,
        nextBookedMaintenance: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      logAudit(
        tail,
        {
          action: "create",
          entity: "aircraft",
          summary: `Aircraft ${tail} created via CSV import (model: ${model})`,
        },
        batch,
      );
      summary.createdAircraft.push(tail);
      // Treat as present for downstream updates in this batch. TTAF will be
      // applied to the new doc via updateAircraft below since we set fields
      // independently (no merge conflict because we set then update in order).
      effectiveAircraft.set(tail, {
        tailNumber: tail,
        model: decision.model,
        totalTimeMinutes: null,
        totalTimeUpdatedAt: null,
        totalTimeUpdatedBy: null,
        totalTimeSource: null,
        nextBookedMaintenance: null,
        // createdAt/updatedAt unused in-memory
      } as unknown as Aircraft);
    } else if (decision.action === "dismiss") {
      summary.dismissedTails.push(tail);
    } else {
      // Pending decision: skip silently. Rows for this tail will be counted as skipped.
    }
  }

  // 2. For each tail with rows, apply TTAF update + create new events
  for (const [tail, rows] of plan.rowsByTail) {
    const aircraft = effectiveAircraft.get(tail);
    if (!aircraft) {
      summary.skippedForUnknownTail += rows.length;
      continue;
    }

    // TTAF update (monotonic: only increase)
    const candidate = plan.ttafCandidateByTail.get(tail);
    if (candidate != null) {
      const stored = aircraft.totalTimeMinutes;
      if (stored == null || candidate >= stored) {
        const ref = doc(db, "aircraft", tail);
        batch.update(ref, {
          totalTimeMinutes: candidate,
          totalTimeUpdatedAt: serverTimestamp(),
          totalTimeUpdatedBy: user.uid,
          totalTimeSource: "import",
          updatedAt: serverTimestamp(),
        });
        logAudit(
          tail,
          {
            action: "update",
            entity: "ttaf",
            summary: `TTAF: ${formatMinutesAsDuration(stored)} → ${formatMinutesAsDuration(candidate)} (source: import)`,
          },
          batch,
        );
        summary.updatedTtaf.push({
          tailNumber: tail,
          before: stored,
          after: candidate,
        });
      } else {
        summary.skippedTtafStale.push({
          tailNumber: tail,
          candidate,
          stored,
        });
      }
    }

    // Event creation with dedup
    for (const row of rows) {
      const key = eventKey(tail, row.warning);
      if (plan.existingEventKeys.has(key)) {
        summary.skippedDuplicateEvents++;
        continue;
      }
      // Skip rows with no usable scheduling data
      if (!row.expiryDate && row.timerExpiryTimeMinutes == null) {
        continue;
      }
      const eventRef = doc(collection(db, "events"));
      batch.set(eventRef, {
        tailNumber: tail,
        warning: row.warning,
        expiryDate: row.expiryDate ? Timestamp.fromDate(row.expiryDate) : null,
        timerExpiryTimeMinutes: row.timerExpiryTimeMinutes,
        workOrderNumber: null,
        status: "unplanned",
        source: "import",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const dueSuffix = row.expiryDate
        ? ` (due ${formatDate(Timestamp.fromDate(row.expiryDate))})`
        : "";
      logAudit(
        tail,
        {
          action: "create",
          entity: "event",
          entityId: eventRef.id,
          summary: `Event imported: ${row.warning}${dueSuffix}`,
        },
        batch,
      );
      plan.existingEventKeys.add(key); // prevent duplicates within the same file
      summary.createdEvents++;
    }
  }

  await batch.commit();
  return summary;
}
