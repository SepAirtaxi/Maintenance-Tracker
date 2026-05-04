import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normaliseTailNumber } from "@/lib/tails";
import { logAudit } from "@/services/audit";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import type { EventStatus, MaintenanceEvent } from "@/types";

const eventsCol = () => collection(db, "events");
const eventDoc = (id: string) => doc(db, "events", id);

export type EventInput = {
  tailNumber: string;
  warning: string;
  expiryDate: Date | null;
  timerExpiryTimeMinutes: number | null;
  workOrderNumber: string | null;
  requisitionNumber: string | null;
};

export type EventPatch = Partial<EventInput> & {
  // Only editable on the import-sourced event itself; null clears it.
  importedWarning?: string | null;
};

function statusFromWo(wo: string | null | undefined): EventStatus {
  return wo && wo.trim() ? "planned" : "unplanned";
}

function docToEvent(
  id: string,
  data: Record<string, unknown>,
): MaintenanceEvent {
  return {
    id,
    tailNumber: data.tailNumber as string,
    warning: data.warning as string,
    importedWarning: (data.importedWarning as string | undefined) ?? null,
    expiryDate: (data.expiryDate as Timestamp | null) ?? null,
    timerExpiryTimeMinutes:
      (data.timerExpiryTimeMinutes as number | null) ?? null,
    workOrderNumber: (data.workOrderNumber as string | null) ?? null,
    requisitionNumber: (data.requisitionNumber as string | null) ?? null,
    status: data.status as EventStatus,
    source: (data.source as "import" | "manual") ?? "manual",
    resolvedDate: (data.resolvedDate as Timestamp | undefined) ?? null,
    resolutionWorkOrder:
      (data.resolutionWorkOrder as string | undefined) ?? null,
    resolvedAt: (data.resolvedAt as Timestamp | undefined) ?? null,
    resolvedBy: (data.resolvedBy as string | undefined) ?? null,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

export function subscribeEvents(
  callback: (events: MaintenanceEvent[]) => void,
): () => void {
  const q = query(eventsCol(), orderBy("tailNumber"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToEvent(d.id, d.data())));
  });
}

export async function findEventByTailAndWarning(
  tailNumber: string,
  warning: string,
): Promise<MaintenanceEvent | null> {
  const q = query(
    eventsCol(),
    where("tailNumber", "==", normaliseTailNumber(tailNumber)),
    where("warning", "==", warning),
  );
  const snap = await getDocs(q);
  const first = snap.docs[0];
  return first ? docToEvent(first.id, first.data()) : null;
}

export async function createEvent(
  input: EventInput,
  opts: { source: "import" | "manual" } = { source: "manual" },
): Promise<string> {
  const tail = normaliseTailNumber(input.tailNumber);
  const warning = input.warning.trim();
  if (!tail) throw new Error("Tail number is required.");
  if (!warning) throw new Error("Warning title is required.");
  if (!input.expiryDate && input.timerExpiryTimeMinutes == null) {
    throw new Error("Provide a due date, a TTAF expiry value, or both.");
  }
  const wo = input.workOrderNumber?.trim() || null;
  const req = input.requisitionNumber?.trim() || null;
  const ref = await addDoc(eventsCol(), {
    tailNumber: tail,
    warning,
    importedWarning: null,
    expiryDate: input.expiryDate
      ? Timestamp.fromDate(input.expiryDate)
      : null,
    timerExpiryTimeMinutes: input.timerExpiryTimeMinutes,
    workOrderNumber: wo,
    requisitionNumber: req,
    status: statusFromWo(wo),
    source: opts.source,
    resolvedDate: null,
    resolutionWorkOrder: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const dueSuffix = input.expiryDate
    ? ` (due ${formatDate(Timestamp.fromDate(input.expiryDate))})`
    : "";
  logAudit(tail, {
    action: "create",
    entity: "event",
    entityId: ref.id,
    summary: `Event created: ${warning}${dueSuffix}${
      opts.source === "import" ? " [import]" : ""
    }`,
  });

  return ref.id;
}

export async function updateEvent(
  id: string,
  patch: EventPatch,
): Promise<void> {
  const existingSnap = await getDoc(eventDoc(id));
  const prev = existingSnap.exists()
    ? docToEvent(id, existingSnap.data())
    : null;

  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.warning !== undefined) update.warning = patch.warning.trim();
  if (patch.importedWarning !== undefined) {
    update.importedWarning = patch.importedWarning
      ? patch.importedWarning.trim()
      : null;
  }
  if (patch.expiryDate !== undefined) {
    update.expiryDate = patch.expiryDate
      ? Timestamp.fromDate(patch.expiryDate)
      : null;
  }
  if (patch.timerExpiryTimeMinutes !== undefined) {
    update.timerExpiryTimeMinutes = patch.timerExpiryTimeMinutes;
  }
  if (patch.workOrderNumber !== undefined) {
    const wo = patch.workOrderNumber?.trim() || null;
    update.workOrderNumber = wo;
    update.status = statusFromWo(wo);
  }
  if (patch.requisitionNumber !== undefined) {
    update.requisitionNumber = patch.requisitionNumber?.trim() || null;
  }
  await updateDoc(eventDoc(id), update);

  if (prev) {
    const changes: string[] = [];
    if (patch.workOrderNumber !== undefined) {
      const nextWo = patch.workOrderNumber?.trim() || null;
      if ((prev.workOrderNumber ?? null) !== nextWo) {
        changes.push(
          `WO ${prev.workOrderNumber ?? "—"} → ${nextWo ?? "—"} (${statusFromWo(nextWo)})`,
        );
      }
    }
    if (patch.warning !== undefined && patch.warning.trim() !== prev.warning) {
      changes.push(`title "${prev.warning}" → "${patch.warning.trim()}"`);
    }
    if (patch.importedWarning !== undefined) {
      const nextImported = patch.importedWarning
        ? patch.importedWarning.trim()
        : null;
      if ((prev.importedWarning ?? null) !== nextImported) {
        changes.push(
          `imported title "${prev.importedWarning ?? "—"}" → "${nextImported ?? "—"}"`,
        );
      }
    }
    if (patch.expiryDate !== undefined) {
      const nextDate = patch.expiryDate
        ? formatDate(Timestamp.fromDate(patch.expiryDate))
        : "—";
      const prevDate = formatDate(prev.expiryDate);
      if (nextDate !== prevDate)
        changes.push(`due ${prevDate} → ${nextDate}`);
    }
    if (patch.timerExpiryTimeMinutes !== undefined) {
      if (
        (prev.timerExpiryTimeMinutes ?? null) !==
        (patch.timerExpiryTimeMinutes ?? null)
      ) {
        changes.push(
          `TTAF expiry ${prev.timerExpiryTimeMinutes ?? "—"} → ${patch.timerExpiryTimeMinutes ?? "—"}`,
        );
      }
    }
    if (patch.requisitionNumber !== undefined) {
      const nextReq = patch.requisitionNumber?.trim() || null;
      if ((prev.requisitionNumber ?? null) !== nextReq) {
        changes.push(`REQ ${prev.requisitionNumber ?? "—"} → ${nextReq ?? "—"}`);
      }
    }
    if (changes.length > 0) {
      logAudit(prev.tailNumber, {
        action: "update",
        entity: "event",
        entityId: id,
        summary: `Event "${prev.warning}" updated: ${changes.join("; ")}`,
      });
    }
  }
}

export type ResolveEventInput = {
  resolvedDate: Date;
  // null = administrative close (e.g. AMP/ARC renewals not tracked in the WO
  // system). The dialog drives this via an explicit "administrative" toggle so
  // a missing WO can never be a silent slip-through.
  resolutionWorkOrder: string | null;
};

export async function resolveEvent(
  id: string,
  input: ResolveEventInput,
  byUid: string,
): Promise<void> {
  if (
    !(input.resolvedDate instanceof Date) ||
    isNaN(input.resolvedDate.valueOf())
  ) {
    throw new Error("Resolution date is required.");
  }
  const wo = input.resolutionWorkOrder?.trim() || null;

  const snap = await getDoc(eventDoc(id));
  if (!snap.exists()) throw new Error("Event not found.");
  const prev = docToEvent(id, snap.data());
  if (prev.resolvedAt) throw new Error("Event is already closed.");

  const update: Record<string, unknown> = {
    resolvedDate: Timestamp.fromDate(input.resolvedDate),
    resolutionWorkOrder: wo,
    resolvedAt: serverTimestamp(),
    resolvedBy: byUid,
    updatedAt: serverTimestamp(),
  };
  // Only stamp the event's WO/status when a real WO is provided. An admin
  // close mustn't forge a WO onto an event that legitimately has none.
  if (wo) {
    update.workOrderNumber = wo;
    update.status = statusFromWo(wo);
  }
  await updateDoc(eventDoc(id), update);

  const ttafSuffix =
    prev.timerExpiryTimeMinutes != null
      ? ` at TTAF ${formatMinutesAsDuration(prev.timerExpiryTimeMinutes)}`
      : "";
  const closeDetail = wo ? `WO ${wo}` : "administrative — no WO";
  logAudit(prev.tailNumber, {
    action: "update",
    entity: "event",
    entityId: id,
    summary: `Event closed: "${prev.warning}" (${closeDetail}, on ${formatDate(
      Timestamp.fromDate(input.resolvedDate),
    )})${ttafSuffix}`,
  });
}

export async function deleteEvent(id: string): Promise<void> {
  const snap = await getDoc(eventDoc(id));
  const prev = snap.exists() ? docToEvent(id, snap.data()) : null;
  await deleteDoc(eventDoc(id));
  if (prev) {
    logAudit(prev.tailNumber, {
      action: "delete",
      entity: "event",
      entityId: id,
      summary: `Event deleted: ${prev.warning}`,
    });
  }
}
