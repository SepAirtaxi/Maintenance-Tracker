import type { DocxParse, DocxTable } from "./docx";
import type { ForecastHeader } from "./types";
import { parseDanishDate, parseTtafHours } from "./text";

function findTable(tables: DocxTable[], firstCellEquals: string): DocxTable | undefined {
  return tables.find((t) => {
    const r0 = t.rows[0];
    if (!r0) return false;
    return r0.cells.some((c) => c.text.trim() === firstCellEquals);
  });
}

export function parseHeader(parsed: DocxParse): ForecastHeader {
  const tail = extractTail(parsed.tables);
  const exportDate = parseDanishDate(parsed.pageHeaderText.trim());

  const aircraftTime = findTable(parsed.tables, "Aircraft Time");
  let forecastEndDate: Date | undefined;
  let forecastEndTtafHours: number | undefined;
  if (aircraftTime) {
    for (const row of aircraftTime.rows) {
      const label = row.cells[0]?.text.trim();
      const value = row.cells[1]?.text.trim() ?? "";
      if (label === "Date") forecastEndDate = parseDanishDate(value);
      else if (label === "TTAF") forecastEndTtafHours = parseTtafHours(value);
    }
  }

  return {
    tailNumber: tail,
    exportDate,
    forecastEndDate,
    forecastEndTtafHours,
  };
}

function extractTail(tables: DocxTable[]): string {
  // Title cell looks like "Projection List\n<TAIL>". Search every cell of the
  // first few tables — the title table's structure can shift between exports.
  for (const t of tables.slice(0, 4)) {
    for (const row of t.rows) {
      for (const cell of row.cells) {
        const m = cell.text.match(/Projection\s+List\s*\n+\s*([A-Z0-9-]+)/i);
        if (m) return m[1].trim().toUpperCase();
        // Single-line variant just in case ("Projection List | OY-XXX").
        const m2 = cell.text.match(/Projection\s+List\s*\|\s*([A-Z0-9-]+)/i);
        if (m2) return m2[1].trim().toUpperCase();
      }
    }
  }
  return "";
}
