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
import type { EventStatus, MaintenanceEvent } from "@/types";

const eventsCol = () => collection(db, "events");
const eventDoc = (id: string) => doc(db, "events", id);

export type EventInput = {
  tailNumber: string;
  warning: string;
  expiryDate: Date | null;
  timerExpiryTimeMinutes: number | null;
  workOrderNumber: string | null;
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
    expiryDate: (data.expiryDate as Timestamp | null) ?? null,
    timerExpiryTimeMinutes:
      (data.timerExpiryTimeMinutes as number | null) ?? null,
    workOrderNumber: (data.workOrderNumber as string | null) ?? null,
    status: data.status as EventStatus,
    source: (data.source as "import" | "manual") ?? "manual",
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
  const ref = await addDoc(eventsCol(), {
    tailNumber: tail,
    warning,
    expiryDate: input.expiryDate
      ? Timestamp.fromDate(input.expiryDate)
      : null,
    timerExpiryTimeMinutes: input.timerExpiryTimeMinutes,
    workOrderNumber: wo,
    status: statusFromWo(wo),
    source: opts.source,
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
  patch: Partial<EventInput>,
): Promise<void> {
  const existingSnap = await getDoc(eventDoc(id));
  const prev = existingSnap.exists()
    ? docToEvent(id, existingSnap.data())
    : null;

  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.warning !== undefined) update.warning = patch.warning.trim();
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
