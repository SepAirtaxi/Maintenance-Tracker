// Turns parsed records into the three candidate lists the statement picks from.

import type {
  Axis,
  Candidate,
  ComplianceHeader,
  ComplianceRecord,
  CyclesCandidate,
  DateCandidate,
  HoursCandidate,
} from "./types";
import { parseRemaining, toStopBlock } from "./remaining";
import { consolidate, dateKey, numericKey } from "./consolidate";
import { parseDmyDate } from "./text";

// A date printed in the Compliance Due cell. Unlike the hours and cycles
// figures, a calendar deadline has only one possible meaning, so it is read
// straight off the report rather than reconstructed from Remaining — which
// carries calendar distance only as a rounded month count.
const DUE_DATE = /(\d{2}-\d{2}-\d{4})/;

// Identical events on the same deadline are folded into one card before
// sorting, so a list of eleven life vests reads as a single line.
function nearestFirst(rows: Candidate<number>[]): Candidate<number>[] {
  return consolidate(rows, numericKey).sort((a, b) => a.stop - b.stop);
}

export type BuildOptions = {
  // Injected so the calendar split is testable and so a caller can ask "what
  // did this report say on the day it was printed".
  today?: Date;
};

export function buildStopBlocks(
  header: ComplianceHeader,
  records: ComplianceRecord[],
  opts: BuildOptions = {},
): {
  hours: Axis<HoursCandidate>;
  dates: Axis<DateCandidate>;
  cycles: Axis<CyclesCandidate>;
  warnings: string[];
} {
  const today = opts.today ?? new Date();
  const warnings: string[] = [];

  const hours: Axis<HoursCandidate> = { upcoming: [], overdue: [] };
  const dates: Axis<DateCandidate> = { upcoming: [], overdue: [] };
  const cycles: Axis<CyclesCandidate> = { upcoming: [], overdue: [] };

  let noDeadline = 0;
  let hoursUnanchored = 0;
  let cyclesUnanchored = 0;

  for (const record of records) {
    const rem = parseRemaining(record.remainingRaw);
    let placed = false;

    if (rem.hours !== undefined) {
      if (header.totalHours === undefined) {
        hoursUnanchored += 1;
      } else {
        const stop = toStopBlock(header.totalHours, rem.hours, rem.hoursOverdue);
        (rem.hoursOverdue ? hours.overdue : hours.upcoming).push({
          record,
          stop,
          overdue: rem.hoursOverdue,
          count: 1,
          folded: [record],
        });
        placed = true;
      }
    }

    if (rem.cycles !== undefined) {
      if (header.totalCycles === undefined) {
        cyclesUnanchored += 1;
      } else {
        const stop = toStopBlock(
          header.totalCycles,
          rem.cycles,
          rem.cyclesOverdue,
        );
        (rem.cyclesOverdue ? cycles.overdue : cycles.upcoming).push({
          record,
          stop,
          overdue: rem.cyclesOverdue,
          count: 1,
          folded: [record],
        });
        placed = true;
      }
    }

    const dueDate = record.complianceDueRaw.match(DUE_DATE);
    const parsed = dueDate ? parseDmyDate(dueDate[1]) : undefined;
    if (parsed) {
      const overdue = parsed.getTime() < today.getTime();
      (overdue ? dates.overdue : dates.upcoming).push({
        record,
        stop: parsed,
        overdue,
        count: 1,
        folded: [record],
      });
      placed = true;
    }

    if (!placed) noDeadline += 1;
  }

  if (header.totalHours === undefined && hoursUnanchored > 0)
    warnings.push(
      `Report has no Total Hours figure, so ${hoursUnanchored} flight-hour deadlines could not be placed.`,
    );
  if (header.totalCycles === undefined && cyclesUnanchored > 0)
    warnings.push(
      `Report has no Total Cycles figure, so ${cyclesUnanchored} cycle deadlines could not be placed.`,
    );
  if (noDeadline > 0)
    warnings.push(
      `${noDeadline} of ${records.length} events carry no deadline on any axis and were left out.`,
    );

  const datesNearestFirst = (rows: DateCandidate[]) =>
    consolidate(rows, dateKey).sort(
      (a, b) => a.stop.getTime() - b.stop.getTime(),
    );

  return {
    hours: {
      upcoming: nearestFirst(hours.upcoming),
      // Nearest miss first — the largest stop-block is the one we passed most
      // recently.
      overdue: nearestFirst(hours.overdue).reverse(),
    },
    cycles: {
      upcoming: nearestFirst(cycles.upcoming),
      overdue: nearestFirst(cycles.overdue).reverse(),
    },
    dates: {
      upcoming: datesNearestFirst(dates.upcoming),
      overdue: datesNearestFirst(dates.overdue).reverse(),
    },
    warnings,
  };
}
