// The Remaining cell, and why it — not Compliance Due — is what the statement
// is built from.
//
// Compliance Due is not a single axis. Events tracked against a component's own
// hour meter print that component's figure in the same column as airframe ones,
// with nothing to tell them apart: on OY-CAT a vacuum pump reads "71,70h" and
// an engine overhaul "2.000,00h" against an airframe at 13.709,45h. Nearly half
// of that aircraft's hour limits are component-based. Sorting the column
// directly puts engine overhauls above the next 50 hour inspection.
//
// Remaining is a distance, so it is axis-free: the hours left on the vacuum
// pump are the same hours the airframe will fly. Adding it to the report's own
// Total Hours puts every event, component or airframe, on one scale:
//
//     stop-block = report Total Hours ± Remaining
//
// Verified against all three sample reports on both the hours and the cycles
// axis — e.g. OY-CDU 11.563 + 972 = 12.535C, matching its printed due exactly.
//
// The sign is not in the number. The report writes distance as a magnitude and
// marks direction with "OVD", separately per axis, so "376,00h/OVD58.58monthOVD"
// is 376 hours AND 58.58 months past due, while "4.587,00h/OVD112.94month" is
// past due on hours but not yet on calendar.

import type { RemainingParts } from "./types";
import { parseDanishNumber, parseEnglishNumber } from "./text";

// Observed shapes across the three reports, in full:
//   ""  ·  "21,45h"  ·  "71,45h/51,00C"  ·  "607,05h/3.42month"
//   "5.907,00h/OVD"  ·  "4.587,00h/OVD112.94month"
//   "376,00h/OVD58.58monthOVD"  ·  "5.84month"  ·  "2.35monthOVD"
const HOURS = /(-?[\d.]+,\d{2})h(\/?OVD)?/;
const CYCLES = /(-?[\d.]+,\d{2})C(\/?OVD)?/;
const MONTHS = /([\d.]+)month(OVD)?/;

export function parseRemaining(raw: string): RemainingParts {
  const cell = raw.replace(/\s+/g, "");

  const h = cell.match(HOURS);
  const c = cell.match(CYCLES);
  const m = cell.match(MONTHS);

  return {
    hours: h ? parseDanishNumber(h[1]) : undefined,
    hoursOverdue: Boolean(h?.[2]),
    cycles: c ? parseDanishNumber(c[1]) : undefined,
    cyclesOverdue: Boolean(c?.[2]),
    months: m ? parseEnglishNumber(m[1]) : undefined,
    monthsOverdue: Boolean(m?.[2]),
  };
}

/**
 * Converts a Remaining distance into the absolute figure the statement prints.
 *
 * `base` is the report's own Total Hours or Total Cycles — never the live
 * Flightlogger value. Every Remaining in the file was measured from the ERP's
 * figure at print time, so anchoring to it is what makes the result stable: the
 * stop-block stays correct however many hours the aircraft flies afterwards.
 */
export function toStopBlock(
  base: number,
  distance: number,
  overdue: boolean,
): number {
  return overdue ? base - distance : base + distance;
}
