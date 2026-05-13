import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAudit } from "@/services/audit";
import { formatMinutesAsDuration } from "@/lib/time";
import { normaliseTailNumber } from "@/lib/tails";
import type { Aircraft, GroundingCauseType } from "@/types";

export { normaliseTailNumber };

const aircraftCol = () => collection(db, "aircraft");
const aircraftDoc = (tailNumber: string) => doc(db, "aircraft", tailNumber);

export async function getAircraft(
  tailNumber: string,
): Promise<Aircraft | null> {
  const snap = await getDoc(aircraftDoc(normaliseTailNumber(tailNumber)));
  if (!snap.exists()) return null;
  return snap.data() as Aircraft;
}

export function subscribeAircraft(
  callback: (aircraft: Aircraft[]) => void,
): () => void {
  const q = query(aircraftCol(), orderBy("tailNumber"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data() as Aircraft));
  });
}

export async function createAircraft(input: {
  tailNumber: string;
  model: string;
}): Promise<void> {
  const tail = normaliseTailNumber(input.tailNumber);
  const model = input.model.trim();
  if (!tail) throw new Error("Tail number is required.");
  if (!model) throw new Error("Model is required.");

  const ref = aircraftDoc(tail);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`Aircraft ${tail} already exists.`);
  }

  await setDoc(ref, {
    tailNumber: tail,
    model,
    airworthy: true,
    totalTimeMinutes: null,
    previousTotalTimeMinutes: null,
    totalTimeUpdatedAt: null,
    totalTimeUpdatedBy: null,
    totalTimeSource: null,
    note: null,
    groundingCauseType: null,
    groundingCauseId: null,
    groundingReason: null,
    groundedAt: null,
    groundedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  logAudit(tail, {
    action: "create",
    entity: "aircraft",
    summary: `Aircraft ${tail} created (model: ${model})`,
  });
}

export type GroundingCauseInput =
  | { type: "defect"; defectId: string; defectTitle: string }
  | {
      type: "event";
      eventId: string;
      eventTitle: string;
      workOrderNumber: string | null;
    }
  | { type: "other"; reason: string };

function describeCauseShort(input: GroundingCauseInput): string {
  switch (input.type) {
    case "defect":
      return `Defect "${input.defectTitle}"`;
    case "event":
      return input.workOrderNumber
        ? `WO ${input.workOrderNumber}: "${input.eventTitle}"`
        : `Event "${input.eventTitle}"`;
    case "other":
      return input.reason;
  }
}

// Ground an aircraft with a structured cause. The cause is stored on the
// aircraft doc so the grounded card can render it inline and so resolving a
// linked defect/event can auto-lift the grounding. Idempotent: a no-op when
// the aircraft is already grounded.
export async function groundAircraft(
  tailNumber: string,
  cause: GroundingCauseInput,
  byUid: string,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  const existing = await getDoc(aircraftDoc(tail));
  if (!existing.exists()) throw new Error(`Aircraft ${tail} not found.`);
  const prev = existing.data() as Aircraft;
  const wasAirworthy = prev.airworthy !== false;

  const causeType: GroundingCauseType = cause.type;
  const causeId =
    cause.type === "defect"
      ? cause.defectId
      : cause.type === "event"
        ? cause.eventId
        : null;
  const reason = cause.type === "other" ? cause.reason.trim() : null;

  if (cause.type === "other" && !reason) {
    throw new Error("A grounding reason is required.");
  }

  await updateDoc(aircraftDoc(tail), {
    airworthy: false,
    groundingCauseType: causeType,
    groundingCauseId: causeId,
    groundingReason: reason,
    groundedAt: serverTimestamp(),
    groundedBy: byUid,
    updatedAt: serverTimestamp(),
  });

  const causeDesc = describeCauseShort(cause);
  logAudit(tail, {
    action: "update",
    entity: "aircraft",
    summary: wasAirworthy
      ? `Grounded — cause: ${causeDesc}`
      : `Grounding cause updated: ${causeDesc}`,
  });
}

export type LiftGroundingReason =
  | { kind: "manual" }
  | { kind: "defect-resolved"; defectTitle: string; workOrder: string | null }
  | { kind: "event-closed"; eventTitle: string; workOrder: string | null };

// Lift a grounding. `reason` distinguishes manual ungrounding from auto-lifts
// triggered when a linked defect/event is resolved, so the audit summary
// reads naturally on both paths.
export async function liftGrounding(
  tailNumber: string,
  reason: LiftGroundingReason = { kind: "manual" },
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  const existing = await getDoc(aircraftDoc(tail));
  if (!existing.exists()) return;
  const prev = existing.data() as Aircraft;
  const wasGrounded = prev.airworthy === false;

  await updateDoc(aircraftDoc(tail), {
    airworthy: true,
    groundingCauseType: null,
    groundingCauseId: null,
    groundingReason: null,
    groundedAt: null,
    groundedBy: null,
    updatedAt: serverTimestamp(),
  });

  if (!wasGrounded) return;
  let summary = "Ungrounded";
  if (reason.kind === "defect-resolved") {
    const woSuffix = reason.workOrder ? ` (WO ${reason.workOrder})` : "";
    summary = `Ungrounded — linked defect "${reason.defectTitle}" resolved${woSuffix}`;
  } else if (reason.kind === "event-closed") {
    const woSuffix = reason.workOrder ? ` (WO ${reason.workOrder})` : "";
    summary = `Ungrounded — linked event "${reason.eventTitle}" closed${woSuffix}`;
  }
  logAudit(tail, {
    action: "update",
    entity: "aircraft",
    summary,
  });
}

// Find aircraft grounded with a given cause id (defect or event). Used by
// resolveDefect / resolveEvent to auto-lift groundings tied to the item being
// closed. Returns tail numbers — callers feed them straight into liftGrounding.
export async function findAircraftGroundedByCause(
  causeType: GroundingCauseType,
  causeId: string,
): Promise<string[]> {
  const q = query(
    aircraftCol(),
    where("groundingCauseType", "==", causeType),
    where("groundingCauseId", "==", causeId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data() as Aircraft).tailNumber);
}

export async function updateAircraftModel(
  tailNumber: string,
  model: string,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  const trimmed = model.trim();
  if (!trimmed) throw new Error("Model cannot be empty.");

  const existing = await getDoc(aircraftDoc(tail));
  const prev = existing.data() as Aircraft | undefined;

  await updateDoc(aircraftDoc(tail), {
    model: trimmed,
    updatedAt: serverTimestamp(),
  });

  if (prev && prev.model !== trimmed) {
    logAudit(tail, {
      action: "update",
      entity: "aircraft",
      summary: `Model changed: ${prev.model} → ${trimmed}`,
    });
  }
}

export async function updateAircraftNote(
  tailNumber: string,
  note: string | null,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  const trimmed = note?.trim() ?? "";
  const next = trimmed === "" ? null : trimmed;

  const existing = await getDoc(aircraftDoc(tail));
  const prev = existing.data() as Aircraft | undefined;
  const before = prev?.note ?? null;
  if (before === next) return;

  await updateDoc(aircraftDoc(tail), {
    note: next,
    updatedAt: serverTimestamp(),
  });

  const action = next === null ? "delete" : before === null ? "create" : "update";
  const summary =
    next === null
      ? "Note cleared"
      : before === null
        ? `Note added: "${next}"`
        : `Note updated: "${before}" → "${next}"`;
  logAudit(tail, {
    action,
    entity: "note",
    summary,
  });
}

export async function deleteAircraft(tailNumber: string): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  await deleteDoc(aircraftDoc(tail));
  logAudit(tail, {
    action: "delete",
    entity: "aircraft",
    summary: `Aircraft ${tail} deleted`,
  });
}

export async function updateTtafManual(
  tailNumber: string,
  totalTimeMinutes: number,
  byUid: string,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  if (!Number.isFinite(totalTimeMinutes) || totalTimeMinutes < 0) {
    throw new Error("TTAF must be a non-negative value.");
  }
  const existing = await getDoc(aircraftDoc(tail));
  const prev = existing.data() as Aircraft | undefined;
  const before = prev?.totalTimeMinutes ?? null;

  await updateDoc(aircraftDoc(tail), {
    totalTimeMinutes,
    // Snapshot the prior value so the overview can render the "Last flight"
    // delta. Only meaningful when there was already a stored TTAF.
    previousTotalTimeMinutes: before,
    totalTimeUpdatedAt: serverTimestamp(),
    totalTimeUpdatedBy: byUid,
    totalTimeSource: "manual",
    updatedAt: serverTimestamp(),
  });

  logAudit(tail, {
    action: "update",
    entity: "ttaf",
    summary: `TTAF: ${formatMinutesAsDuration(before)} → ${formatMinutesAsDuration(
      totalTimeMinutes,
    )} (source: manual${
      before != null && totalTimeMinutes < before ? ", decreased" : ""
    })`,
  });
}

export async function upsertAircraftIfMissing(input: {
  tailNumber: string;
  model: string;
}): Promise<"created" | "exists"> {
  const tail = normaliseTailNumber(input.tailNumber);
  const ref = aircraftDoc(tail);
  const existing = await getDoc(ref);
  if (existing.exists()) return "exists";
  await setDoc(ref, {
    tailNumber: tail,
    model: input.model.trim(),
    airworthy: true,
    totalTimeMinutes: null,
    previousTotalTimeMinutes: null,
    totalTimeUpdatedAt: null,
    totalTimeUpdatedBy: null,
    totalTimeSource: null,
    note: null,
    groundingCauseType: null,
    groundingCauseId: null,
    groundingReason: null,
    groundedAt: null,
    groundedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logAudit(tail, {
    action: "create",
    entity: "aircraft",
    summary: `Aircraft ${tail} created via seed/import (model: ${input.model})`,
  });
  return "created";
}

