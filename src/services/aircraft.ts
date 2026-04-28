import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAudit } from "@/services/audit";
import { formatMinutesAsDuration } from "@/lib/time";
import { formatDateRange } from "@/lib/format";
import { normaliseTailNumber } from "@/lib/tails";
import type { Aircraft } from "@/types";

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
    totalTimeUpdatedAt: null,
    totalTimeUpdatedBy: null,
    totalTimeSource: null,
    nextBookedMaintenance: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  logAudit(tail, {
    action: "create",
    entity: "aircraft",
    summary: `Aircraft ${tail} created (model: ${model})`,
  });
}

export async function setAircraftAirworthy(
  tailNumber: string,
  airworthy: boolean,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  const existing = await getDoc(aircraftDoc(tail));
  const prev = existing.data() as Aircraft | undefined;
  const before = prev?.airworthy !== false;
  if (before === airworthy) return;

  await updateDoc(aircraftDoc(tail), {
    airworthy,
    updatedAt: serverTimestamp(),
  });

  logAudit(tail, {
    action: "update",
    entity: "aircraft",
    summary: `Airworthiness: ${before ? "Airworthy" : "Grounded"} → ${
      airworthy ? "Airworthy" : "Grounded"
    }`,
  });
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

export async function deleteAircraft(tailNumber: string): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  await deleteDoc(aircraftDoc(tail));
  logAudit(tail, {
    action: "delete",
    entity: "aircraft",
    summary: `Aircraft ${tail} deleted`,
  });
}

export async function updateBookedMaintenance(
  tailNumber: string,
  range: { from: Date; to: Date } | null,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  if (range && range.to < range.from) {
    throw new Error("'To' date must be on or after 'From' date.");
  }
  const existing = await getDoc(aircraftDoc(tail));
  const prev = existing.data() as Aircraft | undefined;
  const prevRange = prev?.nextBookedMaintenance ?? null;

  const value = range
    ? {
        from: Timestamp.fromDate(range.from),
        to: Timestamp.fromDate(range.to),
      }
    : null;

  await updateDoc(aircraftDoc(tail), {
    nextBookedMaintenance: value,
    updatedAt: serverTimestamp(),
  });

  const before = formatDateRange(prevRange?.from, prevRange?.to);
  const after = range
    ? formatDateRange(
        Timestamp.fromDate(range.from),
        Timestamp.fromDate(range.to),
      )
    : "—";
  logAudit(tail, {
    action: range ? "update" : "delete",
    entity: "booking",
    summary: `Booked maintenance: ${before} → ${after}`,
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
    totalTimeUpdatedAt: null,
    totalTimeUpdatedBy: null,
    totalTimeSource: null,
    nextBookedMaintenance: null,
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

