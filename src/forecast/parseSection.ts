import type { DocxTable } from "./docx";
import type {
  EngineSide,
  EventInterval,
  EventRemaining,
  EventTime,
  ForecastSection,
} from "./types";
import {
  detectEngineSide,
  extractTolerance,
  parseAdNumber,
  parseStackedCell,
} from "./text";

export const SECTION_NAMES: ForecastSection[] = [
  "Components",
  "Tasks",
  "AD's",
  "Inspections",
];

// Yields data rows from a section table — skips the merged section header (row
// 0) and the column header (row 1), then deduplicates adjacent identical cells
// (an artifact of gridSpan duplication on header rows; data rows happen to use
// it too in some exports).
function dataRows(tbl: DocxTable): string[][] {
  if (tbl.rows.length <= 2) return [];
  const out: string[][] = [];
  for (const row of tbl.rows.slice(2)) {
    const cells = row.cells.map((c) => c.text.trim());
    const deduped: string[] = [];
    for (const c of cells) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== c) {
        deduped.push(c);
      }
    }
    out.push(deduped);
  }
  return out;
}

// A pre-dictionary row — the orchestrator will join these against the
// dictionary to fill canonicalName / adNumberCanonical / needsReview.
export type RawRow = {
  section: ForecastSection;
  rawName: string;
  serialNo?: string;
  taskNum?: string;
  ataCode?: string;
  action?: string;
  adNumberRaw?: string;
  adNumberCleaned?: string; // canonical-number candidate after parseAdNumber
  adType?: string;
  engineSide?: EngineSide;
  tolerancePct?: number;
  limit?: EventInterval;
  performed?: EventTime;
  due?: EventTime;
  remaining?: EventRemaining;
};

function timeFromCell(cell: string): EventTime | undefined {
  const s = parseStackedCell(cell);
  if (s.hours === undefined && s.date === undefined) return undefined;
  return { hours: s.hours, date: s.date };
}

function intervalFromCell(cell: string): EventInterval | undefined {
  const s = parseStackedCell(cell);
  if (s.hours === undefined && s.months === undefined) return undefined;
  return { hours: s.hours, months: s.months };
}

function remainingFromCell(cell: string): EventRemaining | undefined {
  const s = parseStackedCell(cell);
  if (s.hours === undefined && s.months === undefined) return undefined;
  return { hours: s.hours, months: s.months };
}

function rowForComponents(row: string[]): RawRow | undefined {
  // Cols: Reg., Components/Action, Serial No., Limit, Perf., TTSC, TTSN, Due, Remaining
  if (row.length < 9) return undefined;
  const { name, pct } = extractTolerance(row[1] ?? "");
  if (!name) return undefined;
  return {
    section: "Components",
    rawName: name,
    serialNo: row[2] || undefined,
    tolerancePct: pct,
    limit: intervalFromCell(row[3] ?? ""),
    performed: timeFromCell(row[4] ?? ""),
    due: timeFromCell(row[7] ?? ""),
    remaining: remainingFromCell(row[8] ?? ""),
  };
}

function rowForTasks(row: string[]): RawRow | undefined {
  // Cols: Reg., Task #, Task, ATA Code, Action, Limit, Perf., TTSC, Due, Rem.
  if (row.length < 10) return undefined;
  const { name: taskName, pct } = extractTolerance(row[2] ?? "");
  if (!taskName) return undefined;
  const action = row[4]?.trim() || undefined;
  const composedRaw = action ? `${taskName} (${action})` : taskName;
  return {
    section: "Tasks",
    rawName: composedRaw,
    taskNum: row[1] || undefined,
    ataCode: row[3] || undefined,
    action,
    tolerancePct: pct,
    limit: intervalFromCell(row[5] ?? ""),
    performed: timeFromCell(row[6] ?? ""),
    due: timeFromCell(row[8] ?? ""),
    remaining: remainingFromCell(row[9] ?? ""),
  };
}

function rowForAds(row: string[]): RawRow | undefined {
  // Cols: Reg., AD No., Description, Type, Perf., TTSC, Due, Rem.
  if (row.length < 8) return undefined;
  const adNoCellRaw = (row[1] ?? "").trim();
  if (!adNoCellRaw) return undefined;
  // Tolerance can appear in the AD No. cell as a trailing paragraph; strip it
  // here AND from the description so neither carries it into the dictionary
  // lookup or the canonical number.
  const adNoCleaned = extractTolerance(adNoCellRaw);
  const adNoFull = adNoCleaned.name;
  const descParsed = extractTolerance(row[2] ?? "");
  const desc = descParsed.name;
  const pct = adNoCleaned.pct ?? descParsed.pct;
  const { canonicalNumber, sideHint } = parseAdNumber(adNoFull);
  if (!canonicalNumber) return undefined;
  const side = sideHint ?? detectEngineSide(desc, adNoFull);
  return {
    section: "AD's",
    rawName: desc,
    adNumberRaw: adNoFull,
    adNumberCleaned: canonicalNumber,
    adType: row[3]?.trim() || undefined,
    engineSide: side,
    tolerancePct: pct,
    performed: timeFromCell(row[4] ?? ""),
    due: timeFromCell(row[6] ?? ""),
    remaining: remainingFromCell(row[7] ?? ""),
  };
}

function rowForInspections(row: string[]): RawRow | undefined {
  // Cols: Reg., Name, Limit, Perf., TTSC, Due, Rem.
  if (row.length < 7) return undefined;
  const { name, pct } = extractTolerance(row[1] ?? "");
  if (!name) return undefined;
  return {
    section: "Inspections",
    rawName: name,
    tolerancePct: pct,
    limit: intervalFromCell(row[2] ?? ""),
    performed: timeFromCell(row[3] ?? ""),
    due: timeFromCell(row[5] ?? ""),
    remaining: remainingFromCell(row[6] ?? ""),
  };
}

const SECTION_PARSERS: Record<ForecastSection, (row: string[]) => RawRow | undefined> = {
  Components: rowForComponents,
  Tasks: rowForTasks,
  "AD's": rowForAds,
  Inspections: rowForInspections,
};

export function parseSectionTable(section: ForecastSection, tbl: DocxTable): RawRow[] {
  const fn = SECTION_PARSERS[section];
  const out: RawRow[] = [];
  for (const row of dataRows(tbl)) {
    const parsed = fn(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

// Find a section table by its first-cell label. Section names appear in row 0
// (gridSpan-duplicated), so testing cells[0].text is sufficient.
export function findSectionTable(
  tables: DocxTable[],
  section: ForecastSection,
): DocxTable | undefined {
  return tables.find((t) => t.rows[0]?.cells[0]?.text.trim() === section);
}

// Helper for parseForecast — pulls all four section tables in one pass.
export function parseAllSections(tables: DocxTable[]): RawRow[] {
  const out: RawRow[] = [];
  for (const section of SECTION_NAMES) {
    const tbl = findSectionTable(tables, section);
    if (!tbl) continue;
    out.push(...parseSectionTable(section, tbl));
  }
  return out;
}

