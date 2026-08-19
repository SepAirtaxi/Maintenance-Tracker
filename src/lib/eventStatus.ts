import { differenceInCalendarDays } from "date-fns";
import type {
  Booking,
  Defect,
  EventTemplate,
  MaintenanceEvent,
} from "@/types";

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

// "Needs hangar booking" thresholds. Surfaces events that have entered the
// booking window so the planner can grab a slot before the plane flies through
// it or the hangar fills up. TTAF dominates when present (events almost always
// hit the hour timer before the calendar one and the calendar is too uncertain
// to plan against weeks in advance); date-only events fall back to days.
export const NEEDS_BOOKING_MINUTES_THRESHOLD = 20 * 60;
export const NEEDS_BOOKING_DAYS_THRESHOLD = 14;

export type NeedsBookingReason = "hours" | "days";

export type NeedsBookingMatch = {
  event: MaintenanceEvent;
  reason: NeedsBookingReason;
  // Minutes remaining when reason === "hours"; days remaining when "days".
  remaining: number;
  // Effective hours-window applied to this event, in minutes (the per-event
  // override if set, else the fleet default). Null for date-only ("days")
  // matches. Lets the dialog show "warns at 5h" and pre-fill the editor.
  thresholdMinutes: number | null;
  // True when the event sits inside the fleet-DEFAULT window but a lower
  // per-event override is holding the active warning back. Snoozed rows are
  // shown (muted) in the Missing dialog so the planner can still see and adjust
  // them, but they don't count toward the badge and don't raise banners.
  snoozed: boolean;
};

// Returns the events that should trigger the "needs booking" reminder. An
// event qualifies when it's unresolved, on an airworthy aircraft, still
// unplanned (no work order cut yet), not linked to a future/active booking,
// and within the threshold:
//   • Hours-based (event has a TTAF timer): 0 ≤ minutes left ≤ 20 hours.
//     If the aircraft has no current TTAF, the event is skipped (we can't tell
//     how close it is).
//   • Date-only (event has expiryDate but no TTAF timer): 0 ≤ days left ≤ 14.
// Events already expired (negative remaining) are intentionally excluded here —
// an overdue event is surfaced by its own red severity on the card, not by a
// booking reminder.
//
// Planned events (a WO already exists) are treated as accounted for and skipped
// even if no calendar slot is linked yet: once the planner has cut a work order
// the item is on their radar, and nagging to also book a slot is noise. Only
// truly unplanned events need the "did anyone act on this?" reminder.
export function getNeedsBookingMatches(
  events: ReadonlyArray<MaintenanceEvent>,
  ttafByTail: ReadonlyMap<string, number | null>,
  airworthyTails: ReadonlySet<string>,
  bookedEventIds: ReadonlySet<string>,
): NeedsBookingMatch[] {
  const out: NeedsBookingMatch[] = [];
  for (const e of events) {
    if (e.resolvedAt) continue;
    if (!airworthyTails.has(e.tailNumber)) continue;
    if (e.workOrderNumber?.trim()) continue;
    if (bookedEventIds.has(e.id)) continue;

    if (e.timerExpiryTimeMinutes != null) {
      const minutes = computeMinutesLeft(
        e,
        ttafByTail.get(e.tailNumber) ?? null,
      );
      if (minutes == null) continue;
      if (minutes < 0) continue;
      const effective =
        e.bookingWindowOverrideMinutes ?? NEEDS_BOOKING_MINUTES_THRESHOLD;
      if (minutes <= effective) {
        // Inside the effective window → an active warning.
        out.push({
          event: e,
          reason: "hours",
          remaining: minutes,
          thresholdMinutes: effective,
          snoozed: false,
        });
      } else if (
        e.bookingWindowOverrideMinutes != null &&
        minutes <= NEEDS_BOOKING_MINUTES_THRESHOLD
      ) {
        // A lower override is suppressing what would otherwise be an active
        // warning. Keep it visible-but-quiet so it stays adjustable.
        out.push({
          event: e,
          reason: "hours",
          remaining: minutes,
          thresholdMinutes: effective,
          snoozed: true,
        });
      }
      continue;
    }

    if (e.expiryDate != null) {
      const days = computeDaysLeft(e);
      if (days == null) continue;
      if (days < 0 || days > NEEDS_BOOKING_DAYS_THRESHOLD) continue;
      out.push({
        event: e,
        reason: "days",
        remaining: days,
        thresholdMinutes: null,
        snoozed: false,
      });
    }
  }
  return out;
}

// Templates whose absence triggers a Missing → Events flag. Match is by
// title, case-insensitive, trimmed. Deliberately narrow: most CAMO-recurring
// items (AMP Review, ARC Renewal, ARC Review, …) are calendar-driven and
// planned out of the forecast, not from this dialog. Only the recurring
// flight-hour inspections need a "did anyone schedule the next one?" check.
// Extend this set when another recurring inspection should join the cycle.
export const MISSING_INSPECTION_TEMPLATE_TITLES: ReadonlySet<string> = new Set([
  "50 hour inspection",
  "100 hour inspection",
  "annual inspection",
]);

export function isMissingInspectionTemplate(tpl: EventTemplate): boolean {
  return MISSING_INSPECTION_TEMPLATE_TITLES.has(
    tpl.title.trim().toLowerCase(),
  );
}

// One row of the Missing → Events tab: an aircraft that's listed on at least
// one active inspection template (see MISSING_INSPECTION_TEMPLATE_TITLES) but
// has no open event linked to any of those templates. The check is
// aircraft-level on purpose — the inspection templates bounce off each other
// (an Annual rolls up the 50/100-hour work), so flagging when any one of them
// is in progress is noise. As long as any anchor inspection event is open,
// the aircraft is in the cycle.
//
// `applicableTemplates` carries every active inspection template that
// includes this tail, so the dialog can show "this aircraft cycles through
// 50h + 100h" as context. `lastCompleted` is the most recent resolved
// inspection event — the hint for what the planner just closed and therefore
// what they may want to schedule next. Null when no inspection event has
// ever been resolved on this aircraft.
export type MissingEventMatch = {
  tailNumber: string;
  applicableTemplates: EventTemplate[];
  airworthy: boolean;
  lastCompleted: {
    templateId: string;
    resolvedDate: MaintenanceEvent["resolvedDate"];
    resolutionWorkOrder: string | null;
    resolutionTtafMinutes: number | null;
  } | null;
};

export function getMissingEventMatches(
  templates: ReadonlyArray<EventTemplate>,
  events: ReadonlyArray<MaintenanceEvent>,
  airworthyTails: ReadonlySet<string>,
): MissingEventMatch[] {
  // Index active inspection templates by tail. Inactive templates and any
  // template outside the inspection set don't gate the check — an aircraft
  // with only AMP/ARC templates assigned is skipped entirely.
  const tplsByTail = new Map<string, EventTemplate[]>();
  for (const tpl of templates) {
    if (!tpl.active) continue;
    if (!isMissingInspectionTemplate(tpl)) continue;
    for (const tail of tpl.tailNumbers) {
      const arr = tplsByTail.get(tail) ?? [];
      arr.push(tpl);
      tplsByTail.set(tail, arr);
    }
  }

  // Single pass over events to (a) find which tails currently hold any open
  // template-linked event whose template is still applicable, and (b) track
  // the most-recent resolved template-linked event per tail.
  const hasOpen = new Set<string>();
  const lastResolved = new Map<
    string,
    {
      templateId: string;
      resolvedDate: MaintenanceEvent["resolvedDate"];
      workOrder: string | null;
      ttafMinutes: number | null;
    }
  >();
  for (const e of events) {
    if (!e.templateId) continue;
    const applicable = tplsByTail.get(e.tailNumber);
    if (!applicable) continue;
    const stillApplicable = applicable.some((t) => t.id === e.templateId);
    if (!stillApplicable) continue;
    if (e.resolvedAt) {
      const prev = lastResolved.get(e.tailNumber);
      const ms = e.resolvedDate?.toMillis() ?? 0;
      const prevMs = prev?.resolvedDate?.toMillis() ?? -1;
      if (ms > prevMs) {
        lastResolved.set(e.tailNumber, {
          templateId: e.templateId,
          resolvedDate: e.resolvedDate,
          workOrder: e.resolutionWorkOrder ?? null,
          ttafMinutes: e.resolutionTtafMinutes ?? null,
        });
      }
    } else {
      hasOpen.add(e.tailNumber);
    }
  }

  const out: MissingEventMatch[] = [];
  for (const [tail, applicableTemplates] of tplsByTail) {
    if (hasOpen.has(tail)) continue;
    const last = lastResolved.get(tail);
    out.push({
      tailNumber: tail,
      applicableTemplates: [...applicableTemplates].sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
      airworthy: airworthyTails.has(tail),
      lastCompleted: last
        ? {
            templateId: last.templateId,
            resolvedDate: last.resolvedDate,
            resolutionWorkOrder: last.workOrder,
            resolutionTtafMinutes: last.ttafMinutes,
          }
        : null,
    });
  }
  out.sort((a, b) => a.tailNumber.localeCompare(b.tailNumber));
  return out;
}

// Builds two id-sets describing which events / defects appear on a booking.
// Only bookings whose linked entity has a WO# count — without one, the entity
// can't be in the "WO + booked" state. Past bookings (entirely before today)
// are skipped: the work is assumed resolved or rescheduled, so they shouldn't
// keep the linked event/defect reading as "booked" once the calendar window
// has elapsed. They remain in Firestore so they're still editable from the
// timeline.
export function buildBookedIdSets(
  bookings: Booking[],
  events: ReadonlyMap<string, MaintenanceEvent>,
  defects: ReadonlyMap<string, Defect>,
  now: Date = new Date(),
): { eventIds: Set<string>; defectIds: Set<string> } {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const eventIds = new Set<string>();
  const defectIds = new Set<string>();
  for (const b of bookings) {
    const toMs = b.to ? b.to.toMillis() : Number.POSITIVE_INFINITY;
    if (toMs < startOfToday) continue;
    for (const eid of b.eventIds ?? []) {
      const e = events.get(eid);
      if (e && e.workOrderNumber?.trim()) eventIds.add(e.id);
    }
    for (const did of b.defectIds ?? []) {
      const d = defects.get(did);
      if (d && d.workOrderNumber?.trim()) defectIds.add(d.id);
    }
  }
  return { eventIds, defectIds };
}
