// Public types for the forecast module — consumed by parseForecast and the UI.

export type ForecastSection = "Inspections" | "AD's" | "Components" | "Tasks";

export const FORECAST_SECTION_DISPLAY_ORDER: ForecastSection[] = [
  "Inspections",
  "AD's",
  "Components",
  "Tasks",
];

export type EngineSide = "L/H" | "R/H";

// A point in time on either the hours axis (TTAF), the calendar axis (date),
// or both. CAMO events can be tracked on either or both axes.
export type EventTime = {
  hours?: number;
  date?: Date;
};

export type EventInterval = {
  hours?: number;
  months?: number;
};

export type EventRemaining = {
  hours?: number;
  months?: number;
};

export type ForecastRow = {
  section: ForecastSection;
  // Raw identifier as it appeared in the upload — preserved verbatim so the
  // user can always trace back to the source document, even when the row
  // resolves cleanly to a canonical name.
  rawName: string;
  // Canonical name from event_dictionary.json. Falls back to rawName when the
  // event isn't in the dictionary; in that case `needsReview` is true.
  canonicalName: string;
  needsReview: boolean;

  // Section-specific fields.
  serialNo?: string;          // Components
  taskNum?: string;           // Tasks
  ataCode?: string;           // Tasks
  action?: string;            // Tasks (Ins, Cal, Rep, Ove, ...)
  adNumberRaw?: string;       // AD's — raw AD No. cell text
  adNumberCanonical?: string; // AD's — canonical AD/SB number from dictionary
  adType?: string;            // AD's — "Recur" / "Initial" / "Term" / ...
  engineSide?: EngineSide;    // AD's (and any per-engine event)

  // Tolerance percent extracted from the name cell (e.g. "Tolerance ±10%" → 10).
  tolerancePct?: number;

  limit?: EventInterval;
  performed?: EventTime;
  due?: EventTime;
  remaining?: EventRemaining;
};

export type ForecastHeader = {
  tailNumber: string;
  // Export date pulled from the page header (e.g. "maj 5, 2026").
  exportDate?: Date;
  // Forecast bounds pulled from the "Aircraft Time" subtable.
  forecastEndDate?: Date;
  forecastEndTtafHours?: number;
};

export type ForecastParse = {
  header: ForecastHeader;
  rows: ForecastRow[];
};

// ---- Consolidation model ---------------------------------------------------
// Produced by src/forecast/consolidation.ts. See forecast_project/PLAN.md
// "Consolidation model" — Rule #1, anchor = next 50 hr, four bands, direction.

export type ForecastBand =
  | "green"           // |gap| ≤ green tolerance (default 5 h)
  | "amber"           // |gap| ≤ amber tolerance (default 10 h), outside green
  | "forced_awkward"  // beyond ±amber but inside the cycle window
  | "defer";          // beyond anchor + cycle (default 50 h) — next cycle

export type ForecastDirection =
  | "at_anchor"           // gap ≈ 0
  | "pulls_forward"       // gap > 0 — item brought forward into anchor visit
  | "anchor_moves"        // gap < 0 within amber — anchor shifts earlier
  | "needs_earlier_visit"; // gap < 0 beyond amber — can't be absorbed

export type ForecastConsolidationRow = ForecastRow & {
  band: ForecastBand;
  direction: ForecastDirection;
  // Hours between item deadline and the anchor. Negative = before anchor.
  gapHours: number;
  // True when gapHours was derived from a date-based deadline via the
  // utilization rate (calendar → hour conversion). Slop is ±1 day.
  gapEstimated: boolean;
  // True for cat-practice rows that bypass band gating and ride along on every
  // 50 hr visit per the consolidation model.
  catPracticeAutoInclude?: boolean;
};

export type ForecastAnchor = {
  // The 50 hr inspection row chosen as the anchor — null when no 50 hr row was
  // found in the parsed forecast (degraded mode).
  anchorRow: ForecastRow | null;
  anchorTtafHours: number | null;
  anchorDate: Date | null;
  // Distance from "now" to the anchor, on each axis. Null when the
  // corresponding axis is unavailable (no current TTAF / no anchor date).
  hoursToAnchor: number | null;
  daysToAnchor: number | null;
  // True when a 100 hr inspection row coincides with the anchor (within ±0.5 h
  // on the TTAF axis). Drives the "50+100" badge in the anchor card.
  is50Plus100: boolean;
};

export type ForecastConsolidation = {
  anchor: ForecastAnchor;
  // Greens + ambers + cat-practice auto-includes. Use these for the draft WO.
  draftWorkOrder: ForecastConsolidationRow[];
  // forced-but-awkward rows (the human must decide).
  flaggedForReview: ForecastConsolidationRow[];
  // defer-band rows (next 50 hr cycle).
  nextCycle: ForecastConsolidationRow[];
  // Rows that couldn't be band-assigned at all (missing both axes, or missing
  // current TTAF when only a date deadline was available). Surfaced so they
  // don't silently disappear.
  unclassified: ForecastRow[];
  // Inputs echoed back for the UI + debugging.
  currentTtafHours: number | null;
  today: Date;
  utilizationHoursPerMonth: number;
  tolerances: { greenHours: number; amberHours: number };
  // Non-fatal issues (e.g. no 50 hr row found, no current TTAF on file).
  warnings: string[];
};
