// Public types for the compliance-report module — the ERP "Aircraft Status"
// PDF that feeds the actual maintenance statement's three Next Due rows.

// One text run lifted off a PDF page, with the position we need to rebuild the
// table. `top` is measured from the top of the page so it sorts the way the
// page reads.
export type TextItem = {
  text: string;
  x: number;
  top: number;
  page: number;
};

// The identity block printed above the table on every page.
export type ComplianceHeader = {
  tailNumber: string;
  manufacturer?: string;
  model?: string;
  description?: string;
  // The ERP's own idea of the aircraft's hours/cycles at print time. We do NOT
  // put these on the statement — Flightlogger is the operational truth — but
  // every Remaining figure in the report is measured from them, so they are
  // what converts a Remaining into an absolute stop-block.
  totalHours?: number;
  totalCycles?: number;
  printedOn?: Date;
};

// One row of the table, kept as raw text so nothing is lost before the
// interpreting step and the user can always trace a card back to the report.
export type ComplianceRecord = {
  eventType: string; // "Inspection", "Airworthiness Directive", ...
  description: string;
  ataCode?: string;
  status: string; // "Mandatory" / "Optional" / "Recommended"
  frequencyRaw: string;
  lastComplianceRaw: string;
  remainingRaw: string;
  complianceDueRaw: string;
  page: number;
};

// The Remaining cell decomposed. Each axis carries its own overdue flag: the
// report writes the distance as a magnitude and marks direction with "OVD",
// so 376,00h/OVD means 376 hours PAST due, not 376 hours to go.
export type RemainingParts = {
  hours?: number;
  hoursOverdue: boolean;
  cycles?: number;
  cyclesOverdue: boolean;
  months?: number;
  monthsOverdue: boolean;
};

// A candidate for one of the statement's three Next Due rows. `stop` is the
// absolute figure that would be printed; `overdue` means it is already behind
// us, which makes the aircraft unairworthy regardless of what the event is.
export type Candidate<TStop> = {
  // The record whose description the card shows. When several identical events
  // fall on the same deadline this is the first of them.
  record: ComplianceRecord;
  stop: TStop;
  overdue: boolean;
  // How many events this card stands for — 1 for an ordinary one. A fleet
  // carries eleven life vests, and the statement needs to say "life vest
  // inspection", not say it eleven times.
  count: number;
  // Every record folded into the card, `record` first. Nothing is discarded by
  // consolidating, so a count can always be traced back to its rows.
  folded: ComplianceRecord[];
};

export type HoursCandidate = Candidate<number>;
export type DateCandidate = Candidate<Date>;
export type CyclesCandidate = Candidate<number>;

export type Axis<T> = {
  // Ascending — nearest first. This is the picker list.
  upcoming: T[];
  // Already behind us, nearest miss first.
  overdue: T[];
};

export type ComplianceReport = {
  header: ComplianceHeader;
  records: ComplianceRecord[];
  hours: Axis<HoursCandidate>;
  dates: Axis<DateCandidate>;
  cycles: Axis<CyclesCandidate>;
  // Non-fatal problems worth showing above the picker (missing header figures,
  // rows that carry no deadline on any axis, and so on).
  warnings: string[];
};
