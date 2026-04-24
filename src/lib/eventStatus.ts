import { differenceInCalendarDays } from "date-fns";
import type { MaintenanceEvent } from "@/types";

// Severity thresholds. Worst-of wins when both dimensions are present.
export const DAYS_YELLOW_THRESHOLD = 30;
export const HOURS_YELLOW_THRESHOLD_MINUTES = 25 * 60;

export type Severity = "green" | "yellow" | "red" | "unknown";

export function computeDaysLeft(event: MaintenanceEvent): number | null {
  if (!event.expiryDate) return null;
  return differenceInCalendarDays(event.expiryDate.toDate(), new Date());
}

export function computeMinutesLeft(
  event: MaintenanceEvent,
  currentTtafMinutes: number | null,
): number | null {
  if (event.timerExpiryTimeMinutes == null || currentTtafMinutes == null) {
    return null;
  }
  return event.timerExpiryTimeMinutes - currentTtafMinutes;
}

function severityFromDays(daysLeft: number | null): Severity {
  if (daysLeft == null) return "unknown";
  if (daysLeft < 0) return "red";
  if (daysLeft <= DAYS_YELLOW_THRESHOLD) return "yellow";
  return "green";
}

function severityFromMinutes(minutesLeft: number | null): Severity {
  if (minutesLeft == null) return "unknown";
  if (minutesLeft < 0) return "red";
  if (minutesLeft <= HOURS_YELLOW_THRESHOLD_MINUTES) return "yellow";
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
