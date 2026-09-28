// "What's next" — every event in the report placed in exactly one column,
// flight hours, cycles or calendar, by whichever of its limits calls the
// aircraft in first.
//
// Hours and calendar can't be compared without guessing how much the aircraft
// will fly, and utilisation swings with the weather and the students' training
// phase. So there is no guess: a usage limit outranks a calendar one, because
// in practice the hours are what bring an aircraft in. Order of precedence:
//
//     hours  →  cycles  →  calendar
//
// The one exception is a limit already passed. An overdue deadline is behind
// us whatever the utilisation, so it decides the column on its own — an event
// 2 months past its calendar limit with 40 hours still to go is a calendar
// problem, not an hours one.

import type {
  ComplianceHeader,
  ComplianceRecord,
  RemainingParts,
} from "./types";
import { parseRemaining, toStopBlock } from "./remaining";
import { consolidate } from "./consolidate";
import { parseDmyDate } from "./text";

export type NextDueAxis = "hours" | "cycles" | "calendar";

// Every limit the event carries, so the row can show its secondary deadlines
// alongside the one that placed it.
export type NextDueLimits = {
  hours?: { stop: number; left: number; overdue: boolean };
  cycles?: { stop: number; left: number; overdue: boolean };
  // `left` is whole days from today; negative once passed.
  calendar?: { stop: Date; left: number; overdue: boolean };
};

export type NextDueItem = {
  record: ComplianceRecord;
  axis: NextDueAxis;
  limits: NextDueLimits;
  overdue: boolean;
  // Identical events on the same deadlines fold into one row.
  count: number;
};

// The scheduled inspections the rest of the programme is planned around —
// "50 hour inspection.", "100 hour inspection.", "Annual inspection.",
// "2000 hour major inspection." and so on. Matched on the whole description so
// component tasks that merely mention an interval ("Alternator 100 hour
// inspection.", "Annual inspection of ELT.") are not mistaken for one.
const ANCHOR =
  /^(?:\d[\d.,]*\s*(?:hours?|hrs?|h|fh)\s+(?:major\s+)?inspection|annual\s+inspection|major\s+inspection)\.?$/i;

export function isAnchorInspection(description: string): boolean {
  return ANCHOR.test(description.trim().replace(/\s+/g, " "));
}

export type NextDueColumns = Record<NextDueAxis, NextDueItem[]>;

const DUE_DATE = /(\d{2}-\d{2}-\d{4})/;
const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function limitsFor(
  header: ComplianceHeader,
  record: ComplianceRecord,
  rem: RemainingParts,
  today: Date,
): NextDueLimits {
  const limits: NextDueLimits = {};

  // Hours and cycles left are read straight off the Remaining cell — the
  // distance as of the day the report was printed.
  if (rem.hours !== undefined && header.totalHours !== undefined)
    limits.hours = {
      stop: toStopBlock(header.totalHours, rem.hours, rem.hoursOverdue),
      left: rem.hoursOverdue ? -rem.hours : rem.hours,
      overdue: rem.hoursOverdue,
    };

  if (rem.cycles !== undefined && header.totalCycles !== undefined)
    limits.cycles = {
      stop: toStopBlock(header.totalCycles, rem.cycles, rem.cyclesOverdue),
      left: rem.cyclesOverdue ? -rem.cycles : rem.cycles,
      overdue: rem.cyclesOverdue,
    };

  // Calendar is counted from today, not from the print date — a date doesn't
  // move, so the days left are always live.
  const m = record.complianceDueRaw.match(DUE_DATE);
  const due = m ? parseDmyDate(m[1]) : undefined;
  if (due) {
    const left = Math.round(
      (due.getTime() - startOfDay(today).getTime()) / DAY,
    );
    limits.calendar = { stop: due, left, overdue: left < 0 };
  }

  return limits;
}

function placeOf(limits: NextDueLimits): NextDueAxis | null {
  // An overdue limit wins outright; with several overdue, the same precedence
  // breaks the tie.
  if (limits.hours?.overdue) return "hours";
  if (limits.cycles?.overdue) return "cycles";
  if (limits.calendar?.overdue) return "calendar";
  if (limits.hours) return "hours";
  if (limits.cycles) return "cycles";
  if (limits.calendar) return "calendar";
  return null;
}

// Sort key along the item's own axis: overdue first (furthest behind at the
// top), then nearest first.
function leftOn(item: NextDueItem): number {
  return item.limits[item.axis]!.left;
}

export function buildNextDue(
  header: ComplianceHeader,
  records: ComplianceRecord[],
  today: Date = new Date(),
): NextDueColumns {
  const columns: NextDueColumns = { hours: [], cycles: [], calendar: [] };

  for (const record of records) {
    const limits = limitsFor(
      header,
      record,
      parseRemaining(record.remainingRaw),
      today,
    );
    const axis = placeOf(limits);
    if (!axis) continue;
    columns[axis].push({
      record,
      axis,
      limits,
      overdue: limits[axis]!.overdue,
      count: 1,
    });
  }

  for (const axis of Object.keys(columns) as NextDueAxis[]) {
    // consolidate() works on Candidates; the item itself rides along as the
    // stop so nothing is lost, and the key covers every limit so two events
    // only fold when all their deadlines match.
    const folded = consolidate(
      columns[axis].map((item) => ({
        record: item.record,
        stop: item,
        overdue: item.overdue,
        count: 1,
        folded: [item.record],
      })),
      (item) =>
        [
          item.limits.hours?.stop.toFixed(2),
          item.limits.cycles?.stop.toFixed(2),
          item.limits.calendar?.stop.getTime(),
        ].join("|"),
    );
    columns[axis] = folded
      .map((c) => ({ ...c.stop, count: c.count }))
      .sort((a, b) => leftOn(a) - leftOn(b));
  }

  return columns;
}
