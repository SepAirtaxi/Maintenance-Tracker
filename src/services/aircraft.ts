import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAudit } from "@/services/audit";
import { formatMinutesAsDuration } from "@/lib/time";
import { formatBookingRange } from "@/lib/format";
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
    note: null,
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

export async function updateBookedMaintenance(
  tailNumber: string,
  range: { from: Date; to: Date | null } | null,
): Promise<void> {
  const tail = normaliseTailNumber(tailNumber);
  if (range && range.to && range.to < range.from) {
    throw new Error("'To' date must be on or after 'From' date.");
  }
  const existing = await getDoc(aircraftDoc(tail));
  const prev = existing.data() as Aircraft | undefined;
  const prevRange = prev?.nextBookedMaintenance ?? null;

  const value = range
    ? {
        from: Timestamp.fromDate(range.from),
        to: range.to ? Timestamp.fromDate(range.to) : null,
      }
    : null;

  await updateDoc(aircraftDoc(tail), {
    nextBookedMaintenance: value,
    updatedAt: serverTimestamp(),
  });

  const before = formatBookingRange(prevRange?.from, prevRange?.to);
  const after = range
    ? formatBookingRange(
        Timestamp.fromDate(range.from),
        range.to ? Timestamp.fromDate(range.to) : null,
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

// Auto-clears bookings whose `to` date has already passed, and writes an
// audit entry for each one. Open-ended bookings (`to: null`) are left alone.
// Uses a transaction with a guard so concurrent clients don't double-clear.
export async function sweepExpiredBookings(
  aircraft: Aircraft[],
): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  for (const a of aircraft) {
    const booking = a.nextBookedMaintenance;
    if (!booking || !booking.to) continue;
    if (booking.to.toMillis() >= startOfTodayMs) continue;

    const expectedFromMs = booking.from.toMillis();
    const expectedToMs = booking.to.toMillis();
    const ref = aircraftDoc(a.tailNumber);

    let cleared = false;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const cur = snap.data() as Aircraft;
        const curBooking = cur.nextBookedMaintenance;
        if (!curBooking || !curBooking.to) return;
        if (curBooking.from.toMillis() !== expectedFromMs) return;
        if (curBooking.to.toMillis() !== expectedToMs) return;
        tx.update(ref, {
          nextBookedMaintenance: null,
          updatedAt: serverTimestamp(),
        });
        cleared = true;
      });
    } catch (err) {
      // Permission errors (viewer, sign-out race) and transient failures are
      // non-fatal — the sweep will retry on the next page load.
      if (import.meta.env.DEV) {
        console.warn("sweepExpiredBookings failed for", a.tailNumber, err);
      }
      continue;
    }

    if (cleared) {
      logAudit(a.tailNumber, {
        action: "delete",
        entity: "booking",
        summary: `Aircraft left maintenance hangar (booked ${formatBookingRange(
          booking.from,
          booking.to,
        )})`,
      });
    }
  }
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
    note: null,
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

