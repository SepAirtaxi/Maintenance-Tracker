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
};

// Returns the events that should trigger the "needs booking" reminder. An
// event qualifies when it's unresolved, on an airworthy aircraft, has no
// future/active booking linked, and is within the threshold:
//   • Hours-based (event has a TTAF timer): 0 ≤ minutes left ≤ 20 hours.
//     If the aircraft has no current TTAF, the event is skipped (we can't tell
//     how close it is).
//   • Date-only (event has expiryDate but no TTAF timer): 0 ≤ days left ≤ 14.
// Events already expired (negative remaining) are handled by the separate
// auto-grounding sweep and intentionally excluded here.
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
    if (bookedEventIds.has(e.id)) continue;

    if (e.timerExpiryTimeMinutes != null) {
      const minutes = computeMinutesLeft(
        e,
        ttafByTail.get(e.tailNumber) ?? null,
      );
      if (minutes == null) continue;
      if (minutes < 0 || minutes > NEEDS_BOOKING_MINUTES_THRESHOLD) continue;
      out.push({ event: e, reason: "hours", remaining: minutes });
      continue;
    }

    if (e.expiryDate != null) {
      const days = computeDaysLeft(e);
      if (days == null) continue;
      if (days < 0 || days > NEEDS_BOOKING_DAYS_THRESHOLD) continue;
      out.push({ event: e, reason: "days", remaining: days });
    }
  }
  return out;
}

// One row of the Missing → Events tab: an aircraft that's listed on at least
// one active template but has no open event linked to any of those templates.
// The check is aircraft-level on purpose — the recurring inspections bounce
// between e.g. 50 and 100 hour, so flagging both as missing whenever only one
// is in progress is noise. As long as an aircraft has any one of its
// applicable scheduled events open, it counts as "in the cycle".
//
// `applicableTemplates` carries every active template that includes this
// tail, so the dialog can show "this aircraft is supposed to cycle through
// 50h + 100h" as context. `lastCompleted` is the most recent resolved event
// (across any template) — the hint for what the planner just closed and
// therefore what they may want to schedule next. Null when no
// template-linked event has ever been resolved on this aircraft.
export type MissingEventMatch = {
  tailNumber: string;
  applicableTemplates: EventTemplate[];
  airworthy: boolean;
  lastCompleted: {
    templateId: string;
    resolvedDate: MaintenanceEvent["resolvedDate"];
    resolutionWorkOrder: string | null;
  } | null;
};

export function getMissingEventMatches(
  templates: ReadonlyArray<EventTemplate>,
  events: ReadonlyArray<MaintenanceEvent>,
  airworthyTails: ReadonlySet<string>,
): MissingEventMatch[] {
  // Index active templates by tail. Inactive templates don't gate the check —
  // an aircraft only listed on inactive templates is treated as having no
  // applicable scheduled events at all and is skipped.
  const tplsByTail = new Map<string, EventTemplate[]>();
  for (const tpl of templates) {
    if (!tpl.active) continue;
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
