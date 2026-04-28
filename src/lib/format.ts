import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

export function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  return format(ts.toDate(), "dd.MM.yyyy");
}

export function formatDateTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  return format(ts.toDate(), "dd.MM.yyyy HH:mm");
}

export function formatDateRange(
  from: Timestamp | null | undefined,
  to: Timestamp | null | undefined,
): string {
  if (!from || !to) return "—";
  return `${formatDate(from)} – ${formatDate(to)}`;
}

// Booking-aware: a missing `to` means open-ended (release date unknown).
export function formatBookingRange(
  from: Timestamp | null | undefined,
  to: Timestamp | null | undefined,
): string {
  if (!from) return "—";
  if (!to) return `${formatDate(from)} – open`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}
