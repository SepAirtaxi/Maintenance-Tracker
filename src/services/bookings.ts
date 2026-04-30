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
import { requireCurrentUserCtx } from "@/lib/currentUser";
import { formatBookingRange } from "@/lib/format";
import type { Booking } from "@/types";

const bookingsCol = () => collection(db, "bookings");
const bookingDoc = (id: string) => doc(db, "bookings", id);
const eventDocRef = (id: string) => doc(db, "events", id);

export type BookingInput = {
  tailNumber: string;
  from: Date;
  to: Date | null;
  eventId: string | null;
  notes: string | null;
};

export type BookingPatch = Partial<BookingInput>;

const OPEN_ENDED = Number.POSITIVE_INFINITY;

function rangeMs(from: Date | Timestamp, to: Date | Timestamp | null) {
  const fromMs = from instanceof Timestamp ? from.toMillis() : from.getTime();
  const toMs = to == null
    ? OPEN_ENDED
    : to instanceof Timestamp
      ? to.toMillis()
      : to.getTime();
  return { fromMs, toMs };
}

function rangesOverlap(
  aFromMs: number,
  aToMs: number,
  bFromMs: number,
  bToMs: number,
): boolean {
  return aFromMs <= bToMs && bFromMs <= aToMs;
}

function docToBooking(id: string, data: Record<string, unknown>): Booking {
  return {
    id,
    tailNumber: data.tailNumber as string,
    from: data.from as Timestamp,
    to: (data.to as Timestamp | null) ?? null,
    eventId: (data.eventId as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    createdAt: data.createdAt as Timestamp,
    createdBy: (data.createdBy as string) ?? "",
    updatedAt: data.updatedAt as Timestamp,
  };
}

export function subscribeBookings(
  callback: (bookings: Booking[]) => void,
): () => void {
  const q = query(bookingsCol(), orderBy("from", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToBooking(d.id, d.data())));
  });
}

async function fetchBookingsForTail(tail: string): Promise<Booking[]> {
  const q = query(bookingsCol(), where("tailNumber", "==", tail));
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToBooking(d.id, d.data()));
}

function validateNoOverlap(
  tail: string,
  fromDate: Date,
  toDate: Date | null,
  existing: Booking[],
  ignoreId: string | null,
): void {
  const { fromMs, toMs } = rangeMs(fromDate, toDate);
  for (const b of existing) {
    if (b.id === ignoreId) continue;
    const { fromMs: bFromMs, toMs: bToMs } = rangeMs(b.from, b.to);
    if (rangesOverlap(fromMs, toMs, bFromMs, bToMs)) {
      throw new Error(
        `Overlaps an existing booking on ${tail} (${formatBookingRange(b.from, b.to)}). Adjust the dates or edit the existing booking.`,
      );
    }
  }
}

async function describeForAudit(input: {
  tailNumber: string;
  from: Date;
  to: Date | null;
  eventId: string | null;
  notes: string | null;
}): Promise<string> {
  const range = formatBookingRange(
    Timestamp.fromDate(input.from),
    input.to ? Timestamp.fromDate(input.to) : null,
  );
  const parts: string[] = [range];
  if (input.eventId) {
    const snap = await getDoc(eventDocRef(input.eventId));
    if (snap.exists()) {
      const e = snap.data();
      const wo = (e.workOrderNumber as string | null) ?? null;
      const warning = (e.warning as string | undefined) ?? "";
      const evLabel = wo ? `WO ${wo} ${warning}` : warning;
      parts.push(`event: ${evLabel.trim() || input.eventId}`);
    } else {
      parts.push(`event: ${input.eventId} (missing)`);
    }
  }
  if (input.notes) parts.push(`"${input.notes}"`);
  return parts.join(" · ");
}

async function validateEventBelongsToTail(
  eventId: string,
  tail: string,
): Promise<void> {
  const snap = await getDoc(eventDocRef(eventId));
  if (!snap.exists()) {
    throw new Error("Selected event no longer exists.");
  }
  const data = snap.data();
  if ((data.tailNumber as string) !== tail) {
    throw new Error("Selected event belongs to a different tail.");
  }
}

export async function createBooking(input: BookingInput): Promise<string> {
  const tail = normaliseTailNumber(input.tailNumber);
  if (!tail) throw new Error("Tail number is required.");
  if (!(input.from instanceof Date) || isNaN(input.from.valueOf())) {
    throw new Error("From date is required.");
  }
  if (input.to != null) {
    if (!(input.to instanceof Date) || isNaN(input.to.valueOf())) {
      throw new Error("To date is invalid.");
    }
    if (input.to < input.from) {
      throw new Error("'To' date must be on or after 'From' date.");
    }
  }
  const eventId = input.eventId || null;
  const notes = input.notes?.trim() || null;

  if (eventId) await validateEventBelongsToTail(eventId, tail);

  const existing = await fetchBookingsForTail(tail);
  validateNoOverlap(tail, input.from, input.to, existing, null);

  const user = requireCurrentUserCtx();
  const ref = await addDoc(bookingsCol(), {
    tailNumber: tail,
    from: Timestamp.fromDate(input.from),
    to: input.to ? Timestamp.fromDate(input.to) : null,
    eventId,
    notes,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
  });

  const summary = await describeForAudit({
    tailNumber: tail,
    from: input.from,
    to: input.to,
    eventId,
    notes,
  });
  logAudit(tail, {
    action: "create",
    entity: "booking",
    entityId: ref.id,
    summary: `Booking created: ${summary}`,
  });

  return ref.id;
}

export async function updateBooking(
  id: string,
  patch: BookingPatch,
): Promise<void> {
  const snap = await getDoc(bookingDoc(id));
  if (!snap.exists()) throw new Error("Booking not found.");
  const prev = docToBooking(id, snap.data());

  const tail = patch.tailNumber
    ? normaliseTailNumber(patch.tailNumber)
    : prev.tailNumber;
  const fromDate =
    patch.from !== undefined ? patch.from : prev.from.toDate();
  const toDate =
    patch.to !== undefined ? patch.to : (prev.to ? prev.to.toDate() : null);
  if (!(fromDate instanceof Date) || isNaN(fromDate.valueOf())) {
    throw new Error("From date is required.");
  }
  if (toDate != null) {
    if (!(toDate instanceof Date) || isNaN(toDate.valueOf())) {
      throw new Error("To date is invalid.");
    }
    if (toDate < fromDate) {
      throw new Error("'To' date must be on or after 'From' date.");
    }
  }
  const eventId =
    patch.eventId !== undefined ? patch.eventId || null : prev.eventId;
  const notes =
    patch.notes !== undefined ? patch.notes?.trim() || null : prev.notes;

  if (eventId) await validateEventBelongsToTail(eventId, tail);

  const existing = await fetchBookingsForTail(tail);
  validateNoOverlap(tail, fromDate, toDate, existing, id);

  await updateDoc(bookingDoc(id), {
    updatedAt: serverTimestamp(),
    tailNumber: tail,
    from: Timestamp.fromDate(fromDate),
    to: toDate ? Timestamp.fromDate(toDate) : null,
    eventId,
    notes,
  });

  const beforeStr = await describeForAudit({
    tailNumber: prev.tailNumber,
    from: prev.from.toDate(),
    to: prev.to ? prev.to.toDate() : null,
    eventId: prev.eventId,
    notes: prev.notes,
  });
  const afterStr = await describeForAudit({
    tailNumber: tail,
    from: fromDate,
    to: toDate,
    eventId,
    notes,
  });
  if (beforeStr !== afterStr) {
    logAudit(tail, {
      action: "update",
      entity: "booking",
      entityId: id,
      summary: `Booking updated: ${beforeStr} → ${afterStr}`,
    });
    if (tail !== prev.tailNumber) {
      logAudit(prev.tailNumber, {
        action: "update",
        entity: "booking",
        entityId: id,
        summary: `Booking moved to ${tail}: ${beforeStr} → ${afterStr}`,
      });
    }
  }
}

export async function deleteBooking(id: string): Promise<void> {
  const snap = await getDoc(bookingDoc(id));
  const prev = snap.exists() ? docToBooking(id, snap.data()) : null;
  await deleteDoc(bookingDoc(id));
  if (prev) {
    const summary = await describeForAudit({
      tailNumber: prev.tailNumber,
      from: prev.from.toDate(),
      to: prev.to ? prev.to.toDate() : null,
      eventId: prev.eventId,
      notes: prev.notes,
    });
    logAudit(prev.tailNumber, {
      action: "delete",
      entity: "booking",
      entityId: id,
      summary: `Booking deleted: ${summary}`,
    });
  }
}

// Returns the booking that's active *now* (today within range) on the given
// tail, otherwise the next future booking, otherwise null.
export function nextBookingForTail(
  bookings: Booking[],
  tail: string,
  now: Date = new Date(),
): Booking | null {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const todayMs = startOfToday.getTime();

  let active: Booking | null = null;
  let nextUpcoming: Booking | null = null;
  for (const b of bookings) {
    if (b.tailNumber !== tail) continue;
    const fromMs = b.from.toMillis();
    const toMs = b.to ? b.to.toMillis() : OPEN_ENDED;
    if (fromMs <= todayMs && todayMs <= toMs) {
      if (!active || fromMs < active.from.toMillis()) active = b;
    } else if (fromMs > todayMs) {
      if (!nextUpcoming || fromMs < nextUpcoming.from.toMillis()) {
        nextUpcoming = b;
      }
    }
  }
  return active ?? nextUpcoming;
}

export function isBookingActive(
  booking: Booking | null,
  now: Date = new Date(),
): boolean {
  if (!booking) return false;
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const todayMs = startOfToday.getTime();
  const fromMs = booking.from.toMillis();
  const toMs = booking.to ? booking.to.toMillis() : OPEN_ENDED;
  return fromMs <= todayMs && todayMs <= toMs;
}
