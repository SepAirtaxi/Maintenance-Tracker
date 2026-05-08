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
