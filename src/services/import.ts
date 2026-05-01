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
    const data = d.data() as {
      tailNumber: string;
      warning: string;
      importedWarning?: string | null;
      resolvedAt?: Timestamp | null;
    };
    // Closed events stay in Firestore as legacy but should not block a new
    // occurrence of the same recurring item from being imported.
    if (data.resolvedAt) return;
    // Prefer the locked Flightlogger title; fall back to the editable warning
    // for legacy docs predating importedWarning.
    const identity = data.importedWarning ?? data.warning;
    set.add(eventKey(data.tailNumber, identity));
  });
  return set;
}

async function backfillImportedWarning(): Promise<number> {
  // One-shot, idempotent: for every event missing importedWarning, copy
  // its current (possibly user-edited) warning into importedWarning. After
  // this runs once, dedup uses the locked field for all events.
  //
  // Includes events with source `"import"` and events with no `source` set
  // at all (legacy docs predating source-tracking — likely also from
  // imports). Manual events with `source: "manual"` are skipped; their
  // importedWarning stays null unless the user fills it in.
  //
  // For events the user has already renamed, the user must manually correct
  // importedWarning later (via the event edit dialog) to the original
  // Flightlogger title — otherwise the next import will create a duplicate.
  const snap = await getDocs(collection(db, "events"));
  const batch = writeBatch(db);
  let count = 0;
  snap.forEach((d) => {
    const data = d.data() as {
      warning: string;
      importedWarning?: string | null;
      source?: string;
    };
    if (data.importedWarning != null) return;
    if (data.source === "manual") return;
    batch.update(d.ref, {
      importedWarning: data.warning,
      updatedAt: serverTimestamp(),
    });
    count++;
  });
  if (count > 0) {
    await batch.commit();
  }
  return count;
}

export async function buildImportPlan(rows: CsvRow[]): Promise<ImportPlan> {
  const rowsByTail = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const arr = rowsByTail.get(row.callSign) ?? [];
    arr.push(row);
    rowsByTail.set(row.callSign, arr);
  }

  // Run before fetching keys so the dedup set reflects the post-backfill
  // state. After the first run this is a no-op.
  await backfillImportedWarning();

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
        importedWarning: row.warning,
        expiryDate: row.expiryDate ? Timestamp.fromDate(row.expiryDate) : null,
        timerExpiryTimeMinutes: row.timerExpiryTimeMinutes,
        workOrderNumber: null,
        requisitionNumber: null,
        status: "unplanned",
        source: "import",
        resolvedDate: null,
        resolutionWorkOrder: null,
        resolvedAt: null,
        resolvedBy: null,
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
