import { differenceInCalendarDays } from "date-fns";
import type { Booking, Defect, MaintenanceEvent } from "@/types";

// Severity thresholds. "Green until <X" semantics:
//   days >= 7  → green
//   0 <= days < 7 → yellow
//   days < 0   → red
//   minutes >= 600 → green
//   0 <= minutes < 600 → yellow
//   minutes < 0 → red
// Worst-of wins when both dimensions are present.
export const DAYS_YELLOW_THRESHOLD = 7;
export const HOURS_YELLOW_THRESHOLD_MINUTES = 10 * 60;

export type Severity = "green" | "yellow" | "red" | "unknown";

export function computeDaysLeft(event: MaintenanceEvent): number | null {
  if (!event.expiryDate) return null;
  return differenceInCalendarDays(event.expiryDate.toDate(), new Date());
}

// CAMO extensions push the effective TTAF expiry out by `extensionMinutes`.
// Returns null when the event has no TTAF expiry at all (calendar-only events).
// We never mutate the stored `timerExpiryTimeMinutes` — extensions live in
// their own field so the original is preserved for audit.
export function getEffectiveTimerExpiryMinutes(
  event: MaintenanceEvent,
): number | null {
  if (event.timerExpiryTimeMinutes == null) return null;
  return event.timerExpiryTimeMinutes + (event.extensionMinutes ?? 0);
}

export function computeMinutesLeft(
  event: MaintenanceEvent,
  currentTtafMinutes: number | null,
): number | null {
  const effective = getEffectiveTimerExpiryMinutes(event);
  if (effective == null || currentTtafMinutes == null) return null;
  return effective - currentTtafMinutes;
}

export function severityFromDays(daysLeft: number | null): Severity {
  if (daysLeft == null) return "unknown";
  if (daysLeft < 0) return "red";
  if (daysLeft < DAYS_YELLOW_THRESHOLD) return "yellow";
  return "green";
}

export function severityFromMinutes(minutesLeft: number | null): Severity {
  if (minutesLeft == null) return "unknown";
  if (minutesLeft < 0) return "red";
  if (minutesLeft < HOURS_YELLOW_THRESHOLD_MINUTES) return "yellow";
  return "green";
}

const ORDER: Record<Severity, number> = {
  unknown: -1,
  green: 0,
  yellow: 1,
  red: 2,
};

export function worstSeverity(a: Severity, b: Severity): Severity {
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  return ORDER[a] >= ORDER[b] ? a : b;
}

export function getEventSeverity(
  event: MaintenanceEvent,
  currentTtafMinutes: number | null,
): Severity {
  const daysSeverity = severityFromDays(computeDaysLeft(event));
  const minutesSeverity = severityFromMinutes(
    computeMinutesLeft(event, currentTtafMinutes),
  );
  return worstSeverity(daysSeverity, minutesSeverity);
}

// Planned/action status surfaced in the overview.
//   • unplanned → no work order assigned yet ("no action taken")
//   • planned   → a work order has been created
//   • booked    → WO exists AND a calendar block links it (booking → eventId
//                 for events, booking → defectIds for defects)
export type PlanStatus = "unplanned" | "planned" | "booked";

export function getEventPlanStatus(
  event: MaintenanceEvent,
  bookedEventIds: ReadonlySet<string>,
): PlanStatus {
  const wo = event.workOrderNumber?.trim();
  if (!wo) return "unplanned";
  return bookedEventIds.has(event.id) ? "booked" : "planned";
}

export function getDefectPlanStatus(
  defect: Defect,
  bookedDefectIds: ReadonlySet<string>,
): PlanStatus {
  const wo = defect.workOrderNumber?.trim();
  if (!wo) return "unplanned";
  return bookedDefectIds.has(defect.id) ? "booked" : "planned";
}

// Deferral state for a defect. CAMO policy is a 30-day review cycle from the
// most recent `deferredAt`; once that elapses the defect needs CAMO follow-up.
//   • none     → not deferred
//   • within   → deferred, days elapsed < 30
//   • overdue  → deferred, days elapsed >= 30 (needs follow-up)
export type DeferralStatus = "none" | "within" | "overdue";

export const DEFERRAL_REVIEW_DAYS = 30;

export function daysSinceDeferred(defect: Defect): number | null {
  if (!defect.deferredAt) return null;
  // Calendar-day delta so a defect deferred yesterday reads "1d", matching how
  // the CAMO counts the review window in practice.
  return differenceInCalendarDays(new Date(), defect.deferredAt.toDate());
}

export function getDeferralStatus(defect: Defect): DeferralStatus {
  const elapsed = daysSinceDeferred(defect);
  if (elapsed == null) return "none";
  return elapsed >= DEFERRAL_REVIEW_DAYS ? "overdue" : "within";
}

// Builds two id-sets describing which events / defects appear on a booking.
// Only bookings whose linked entity has a WO# count — without one, the entity
// can't be in the "WO + booked" state.
export function buildBookedIdSets(
  bookings: Booking[],
  events: ReadonlyMap<string, MaintenanceEvent>,
  defects: ReadonlyMap<string, Defect>,
): { eventIds: Set<string>; defectIds: Set<string> } {
  const eventIds = new Set<string>();
  const defectIds = new Set<string>();
  for (const b of bookings) {
    if (b.eventId) {
      const e = events.get(b.eventId);
      if (e && e.workOrderNumber?.trim()) eventIds.add(e.id);
    }
    for (const did of b.defectIds ?? []) {
      const d = defects.get(did);
      if (d && d.workOrderNumber?.trim()) defectIds.add(d.id);
    }
  }
  return { eventIds, defectIds };
}
