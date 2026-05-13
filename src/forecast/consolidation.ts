// Consolidation engine: turn parsed forecast rows into a proposed Work Order
// against the live aircraft state. See forecast_project/PLAN.md
// "Consolidation model" — Rule #1 (deadlines never exceeded), anchor = next
// 50 hr inspection, four bands (green / amber / forced-but-awkward / defer),
// direction labels, calendar→hour conversion via utilization rate.
//
// Pure: no React, no Firestore. Takes parsed rows + live inputs, returns a
// ForecastConsolidation. The page wires DOM state to it; the smoke test runs
// it under Node.

import type {
  ForecastAnchor,
  ForecastBand,
  ForecastConsolidation,
  ForecastConsolidationRow,
  ForecastDirection,
  ForecastRow,
} from "./types";

export const DEFAULT_GREEN_HOURS = 5;
export const DEFAULT_AMBER_HOURS = 10;
export const CYCLE_HOURS = 50;
export const DEFAULT_UTILIZATION_HOURS_PER_MONTH = 25;
// Lead-time planning horizon: items requiring procurement lead time (Ret /
// Ove actions on components) are surfaced when their deadline falls within
// this window of "now" on either axis. The TTAF window is 2× the cycle so the
// next 50 hr visit's heavy items stay visible; the calendar window is set so
// out-of-cycle calendar deadlines are caught with enough runway to order
// swap units.
export const LEAD_TIME_HOURS_AHEAD = 100;
export const LEAD_TIME_MONTHS_AHEAD = 3;
// Days-per-month for the calendar→hour conversion. 30 is the convention in
// PLAN.md ("× utilization / 30"). Average calendar month would be 30.44; the
// difference is well inside the ±1-day precision target.
const DAYS_PER_MONTH = 30;
const MS_PER_DAY = 86_400_000;
// Snap-to-zero band for the `at_anchor` direction tag — anything tighter than
// half an hour reads as "on the anchor" in the UI.
const AT_ANCHOR_EPSILON_HOURS = 0.5;

export type ConsolidateInput = {
  rows: ForecastRow[];
  // Live TTAF in minutes (matches `Aircraft.totalTimeMinutes`). Null when the
  // aircraft has no recorded TTAF — date-based deadlines can't be projected
  // in that case and fall into `unclassified`.
  currentTtafMinutes: number | null;
  // Today's date (= upload date, per PLAN.md).
  today: Date;
  // Per-aircraft override. Null/undefined → use DEFAULT_UTILIZATION_HOURS_PER_MONTH.
  utilizationHoursPerMonth?: number | null;
  // Override the green/amber tolerances. Defaults to ±5 h / ±10 h.
  tolerances?: { greenHours: number; amberHours: number };
};

export function consolidateForecast(input: ConsolidateInput): ForecastConsolidation {
  const tolerances = input.tolerances ?? {
    greenHours: DEFAULT_GREEN_HOURS,
    amberHours: DEFAULT_AMBER_HOURS,
  };
  const utilization =
    input.utilizationHoursPerMonth != null && input.utilizationHoursPerMonth > 0
      ? input.utilizationHoursPerMonth
      : DEFAULT_UTILIZATION_HOURS_PER_MONTH;
  const currentTtafHours =
    input.currentTtafMinutes != null ? input.currentTtafMinutes / 60 : null;
  const warnings: string[] = [];

  const anchorRow = findAnchorRow(input.rows);
  if (!anchorRow) {
    warnings.push(
      "No 50 hr inspection row found in this forecast — couldn't compute the anchor visit. Bands and direction labels will be unavailable until the next CAMO export includes the 50 hr line.",
    );
  }
  if (currentTtafHours == null) {
    warnings.push(
      "Aircraft TTAF isn't on file in Maintenance Tracker — calendar-only deadlines couldn't be projected. Update TTAF under Settings → Aircraft for full band coverage.",
    );
  }

  const anchor = buildAnchor(anchorRow, input.rows, input.today, currentTtafHours);

  const draftWorkOrder: ForecastConsolidationRow[] = [];
  const flaggedForReview: ForecastConsolidationRow[] = [];
  const nextCycle: ForecastConsolidationRow[] = [];
  const leadTimePlanning: ForecastConsolidationRow[] = [];
  const unclassified: ForecastRow[] = [];
  const leadTimeHorizon = {
    hoursAhead: LEAD_TIME_HOURS_AHEAD,
    monthsAhead: LEAD_TIME_MONTHS_AHEAD,
  };

  if (anchor.anchorTtafHours == null) {
    // No anchor — surface every row as unclassified so nothing silently drops.
    unclassified.push(...input.rows);
    return {
      anchor,
      draftWorkOrder,
      flaggedForReview,
      nextCycle,
      leadTimePlanning,
      leadTimeHorizon,
      unclassified,
      currentTtafHours,
      today: input.today,
      utilizationHoursPerMonth: utilization,
      tolerances,
      warnings,
    };
  }

  for (const row of input.rows) {
    const isAnchor = row === anchorRow;
    const isCatPractice = isCatPracticeRow(row);

    // The anchor row IS the reference point — gap is zero by definition. We
    // don't run it through computeGap because some CAMO records carry a stale
    // calendar deadline alongside a current TTAF (e.g. an annual deadline that
    // hasn't been reset for years); the min-gap rule would then mislabel the
    // anchor as `needs_earlier_visit` from the date axis.
    if (isAnchor) {
      const anchorRow: ForecastConsolidationRow = {
        ...row,
        band: "green",
        direction: "at_anchor",
        gapHours: 0,
        gapEstimated: false,
      };
      draftWorkOrder.push(anchorRow);
      if (isHeavyAction(row) && isInLeadTimeHorizon(row, currentTtafHours, input.today)) {
        leadTimePlanning.push(anchorRow);
      }
      continue;
    }

    const gap = computeGap(
      row,
      anchor.anchorTtafHours,
      currentTtafHours,
      input.today,
      utilization,
    );

    if (gap === null) {
      unclassified.push(row);
      continue;
    }

    const band = assignBand(gap.gapHours, tolerances);
    const direction = directionFor(gap.gapHours, tolerances.amberHours);
    const consolidated: ForecastConsolidationRow = {
      ...row,
      band,
      direction,
      gapHours: gap.gapHours,
      gapEstimated: gap.estimated,
    };

    if (isCatPractice && !isAnchor) {
      consolidated.catPracticeAutoInclude = true;
      // Always rides along with the 50 hr visit — bypass band gating for
      // bucket placement but keep the original band on the row so the UI can
      // still surface "this was technically defer" if it matters.
      draftWorkOrder.push(consolidated);
    } else if (band === "green" || band === "amber") {
      draftWorkOrder.push(consolidated);
    } else if (band === "forced_awkward") {
      flaggedForReview.push(consolidated);
    } else {
      nextCycle.push(consolidated);
    }

    // Additive: heavy items inside the lead-time horizon are duplicated into
    // leadTimePlanning so procurement-class work isn't hidden behind the
    // cycle window. The same row is still in its natural band panel above.
    if (
      isHeavyAction(row) &&
      isInLeadTimeHorizon(row, currentTtafHours, input.today)
    ) {
      leadTimePlanning.push(consolidated);
    }
  }

  // Sort lead-time panel by gap (soonest first) so the row most in need of
  // procurement attention reads first.
  leadTimePlanning.sort((a, b) => a.gapHours - b.gapHours);

  return {
    anchor,
    draftWorkOrder,
    flaggedForReview,
    nextCycle,
    leadTimePlanning,
    leadTimeHorizon,
    unclassified,
    currentTtafHours,
    today: input.today,
    utilizationHoursPerMonth: utilization,
    tolerances,
    warnings,
  };
}

// ---- Anchor detection ------------------------------------------------------

// Match canonical names like "50 hrs Inspection", "50 Hrs insp",
// "50 Hour Inspection - CAT Practice". Excludes lubrication. Cat practice is
// allowed: in some models the 50 hr row and the cat practice add-on are one
// canonical entry.
const FIFTY_HR_INSPECTION_RE = /\b50\s+(hrs?|hour|hours)\b.*\b(inspection|insp)\b/i;
const HUNDRED_HR_INSPECTION_RE = /\b100\s+(hrs?|hour|hours)\b.*\b(inspection|insp)\b/i;
const LUBRICATION_RE = /lubrication/i;
const CAT_PRACTICE_RE = /cat\s*practice/i;

function isFiftyHrInspectionRow(r: ForecastRow): boolean {
  if (r.section !== "Inspections") return false;
  if (LUBRICATION_RE.test(r.canonicalName)) return false;
  return FIFTY_HR_INSPECTION_RE.test(r.canonicalName);
}

function isHundredHrInspectionRow(r: ForecastRow): boolean {
  if (r.section !== "Inspections") return false;
  if (LUBRICATION_RE.test(r.canonicalName)) return false;
  return HUNDRED_HR_INSPECTION_RE.test(r.canonicalName);
}

function isCatPracticeRow(r: ForecastRow): boolean {
  return CAT_PRACTICE_RE.test(r.canonicalName);
}

// Heavy action = retire or overhaul. Components carry the action inline in
// the name cell (e.g. "Engine mount / Ret"); Tasks carry it as a separate
// field. Match either signal so we catch both shapes.
const HEAVY_ACTION_NAME_RE = /\/\s*(ret|ove)\s*$/i;
const HEAVY_ACTION_FIELD_RE = /^(ret|ove)$/i;

function isHeavyAction(r: ForecastRow): boolean {
  if (r.action && HEAVY_ACTION_FIELD_RE.test(r.action.trim())) return true;
  if (HEAVY_ACTION_NAME_RE.test(r.canonicalName)) return true;
  if (HEAVY_ACTION_NAME_RE.test(r.rawName)) return true;
  return false;
}

// True when the row's deadline is within the lead-time horizon on either
// axis. Bounded only from above (≤ horizon) — overdue heavy items remain in
// the panel because they're still procurement-relevant (and have already
// been flagged elsewhere as forced-awkward / needs-earlier-visit).
function isInLeadTimeHorizon(
  r: ForecastRow,
  currentTtafHours: number | null,
  today: Date,
): boolean {
  if (r.due?.hours != null && currentTtafHours != null) {
    const hoursFromNow = r.due.hours - currentTtafHours;
    if (hoursFromNow <= LEAD_TIME_HOURS_AHEAD) return true;
  }
  if (r.due?.date != null) {
    const horizonMs = LEAD_TIME_MONTHS_AHEAD * 30 * MS_PER_DAY;
    if (r.due.date.getTime() - today.getTime() <= horizonMs) return true;
  }
  return false;
}

function findAnchorRow(rows: ForecastRow[]): ForecastRow | null {
  const candidates = rows.filter(isFiftyHrInspectionRow);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  // Multiple 50 hr inspection canonical entries — pick the one with the
  // soonest due-TTAF, falling back to soonest due-date.
  return candidates.reduce((best, r) => {
    const bestTtaf = best.due?.hours ?? Number.POSITIVE_INFINITY;
    const rTtaf = r.due?.hours ?? Number.POSITIVE_INFINITY;
    if (rTtaf < bestTtaf) return r;
    if (rTtaf > bestTtaf) return best;
    const bestDate = best.due?.date?.getTime() ?? Number.POSITIVE_INFINITY;
    const rDate = r.due?.date?.getTime() ?? Number.POSITIVE_INFINITY;
    return rDate < bestDate ? r : best;
  });
}

function buildAnchor(
  anchorRow: ForecastRow | null,
  allRows: ForecastRow[],
  today: Date,
  currentTtafHours: number | null,
): ForecastAnchor {
  if (!anchorRow) {
    return {
      anchorRow: null,
      anchorTtafHours: null,
      anchorDate: null,
      hoursToAnchor: null,
      daysToAnchor: null,
      is50Plus100: false,
    };
  }
  const anchorTtafHours = anchorRow.due?.hours ?? null;
  const anchorDate = anchorRow.due?.date ?? null;
  const hoursToAnchor =
    anchorTtafHours != null && currentTtafHours != null
      ? anchorTtafHours - currentTtafHours
      : null;
  const daysToAnchor =
    anchorDate != null
      ? Math.round((anchorDate.getTime() - today.getTime()) / MS_PER_DAY)
      : null;
  // 100 hr inspections alternate with 50 hrs but the recorded TTAFs can drift
  // a few hours from each other in real data (e.g. a prior 100 hr done a touch
  // early). Treat anything within the green tolerance as the same visit.
  const FIFTY_PLUS_HUNDRED_WINDOW_HOURS = DEFAULT_GREEN_HOURS;
  const is50Plus100 =
    anchorTtafHours != null &&
    allRows.some(
      (r) =>
        isHundredHrInspectionRow(r) &&
        r.due?.hours != null &&
        Math.abs(r.due.hours - anchorTtafHours) <= FIFTY_PLUS_HUNDRED_WINDOW_HOURS,
    );
  return {
    anchorRow,
    anchorTtafHours,
    anchorDate,
    hoursToAnchor,
    daysToAnchor,
    is50Plus100,
  };
}

// ---- Gap calc --------------------------------------------------------------

type GapResult = { gapHours: number; estimated: boolean };

function computeGap(
  row: ForecastRow,
  anchorTtafHours: number,
  currentTtafHours: number | null,
  today: Date,
  utilization: number,
): GapResult | null {
  // Hour-based deadline if present.
  const hourGap =
    row.due?.hours != null ? row.due.hours - anchorTtafHours : null;

  // Date-based deadline if present AND we know the current TTAF (without it,
  // there's nothing to project the date onto the TTAF axis from).
  let dateGap: number | null = null;
  if (row.due?.date != null && currentTtafHours != null) {
    const daysToDeadline =
      (row.due.date.getTime() - today.getTime()) / MS_PER_DAY;
    const hoursFromNowToDeadline = (daysToDeadline * utilization) / DAYS_PER_MONTH;
    const deadlineTtafEst = currentTtafHours + hoursFromNowToDeadline;
    dateGap = deadlineTtafEst - anchorTtafHours;
  }

  if (hourGap == null && dateGap == null) return null;
  if (hourGap != null && dateGap == null) {
    return { gapHours: hourGap, estimated: false };
  }
  if (hourGap == null && dateGap != null) {
    return { gapHours: dateGap, estimated: true };
  }
  // Both axes present — binding axis = whichever runs out first (smaller gap
  // = sooner deadline relative to anchor, honouring Rule #1).
  if (hourGap! <= dateGap!) return { gapHours: hourGap!, estimated: false };
  return { gapHours: dateGap!, estimated: true };
}

// ---- Band + direction ------------------------------------------------------

function assignBand(
  gap: number,
  tolerances: { greenHours: number; amberHours: number },
): ForecastBand {
  const abs = Math.abs(gap);
  if (abs <= tolerances.greenHours) return "green";
  if (abs <= tolerances.amberHours) return "amber";
  // Beyond ±amber. On the positive side, the item is still inside the upcoming
  // cycle iff gap ≤ CYCLE_HOURS; further than that = defer. On the negative
  // side, every item must be handled before the anchor — no symmetric defer.
  // On the positive side, items strictly inside the next 50 hr cycle window
  // are forced-but-awkward (must be handled this visit, awkward fit); items
  // due at or beyond `anchor + CYCLE_HOURS` coincide with the next 50 hr
  // visit and cleanly defer. Most recurring 100/200/500 hr items land on
  // exact 50-multiples, so this boundary matters.
  if (gap > 0) {
    return gap < CYCLE_HOURS ? "forced_awkward" : "defer";
  }
  return "forced_awkward";
}

function directionFor(gap: number, amberHours: number): ForecastDirection {
  if (Math.abs(gap) <= AT_ANCHOR_EPSILON_HOURS) return "at_anchor";
  if (gap > 0) return "pulls_forward";
  if (gap < -amberHours) return "needs_earlier_visit";
  return "anchor_moves";
}
