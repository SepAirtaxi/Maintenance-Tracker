// Smoke test for the consolidation engine.
// Usage: npx tsx forecast_project/smoke_consolidation.ts <docx-path> <model> [currentTTAF-hours] [today-iso]
// e.g.   npx tsx forecast_project/smoke_consolidation.ts forecast_project/training_data/OY-CAH.docx TB-10 2450 2026-05-13
//
// If currentTTAF / today are omitted, today defaults to "now" and currentTTAF
// is taken as 5 h before the docx's forecast-end TTAF (so the anchor falls in
// the near future for a realistic sanity check).

import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as any).DOMParser = DOMParser;

import { parseForecast } from "../src/forecast/parseForecast";
import { consolidateForecast } from "../src/forecast/consolidation";
import type { ForecastConsolidationRow } from "../src/forecast/types";

const path = process.argv[2];
const model = process.argv[3];
const ttafArg = process.argv[4];
const todayArg = process.argv[5];
if (!path || !model) {
  console.error(
    "Usage: tsx smoke_consolidation.ts <file.docx> <model> [currentTTAFHours] [today-iso]",
  );
  process.exit(1);
}

const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const parsed = await parseForecast(ab as ArrayBuffer, { model });

const today = todayArg ? new Date(todayArg) : new Date();
// Default: place current TTAF 5 h before the parsed 50 hr anchor, so the
// upcoming visit sits within the green band — the realistic live scenario.
function pickDefaultCurrentTtaf(): number | null {
  const fifty = parsed.rows.find(
    (r) =>
      r.section === "Inspections" &&
      /\b50\s+(hrs?|hour|hours)\b.*\b(inspection|insp)\b/i.test(r.canonicalName) &&
      !/lubrication/i.test(r.canonicalName),
  );
  if (fifty?.due?.hours != null) return fifty.due.hours - 5;
  return parsed.header.forecastEndTtafHours != null
    ? parsed.header.forecastEndTtafHours - 480
    : null;
}
const currentTtafHours = ttafArg != null ? Number(ttafArg) : pickDefaultCurrentTtaf();
const currentTtafMinutes = currentTtafHours != null ? Math.round(currentTtafHours * 60) : null;

const result = consolidateForecast({
  rows: parsed.rows,
  currentTtafMinutes,
  today,
  utilizationHoursPerMonth: null, // use default
});

console.log("\n=== HEADER ===");
console.log({
  tail: parsed.header.tailNumber,
  model,
  forecastEnd: parsed.header.forecastEndDate?.toISOString().slice(0, 10),
  forecastEndTtaf: parsed.header.forecastEndTtafHours,
  currentTtafHours,
  today: today.toISOString().slice(0, 10),
});

console.log("\n=== ANCHOR ===");
console.log({
  anchorName: result.anchor.anchorRow?.canonicalName ?? "—",
  anchorTtaf: result.anchor.anchorTtafHours,
  anchorDate: result.anchor.anchorDate?.toISOString().slice(0, 10) ?? null,
  hoursToAnchor: result.anchor.hoursToAnchor?.toFixed(1) ?? null,
  daysToAnchor: result.anchor.daysToAnchor,
  is50Plus100: result.anchor.is50Plus100,
});

if (result.warnings.length > 0) {
  console.log("\n=== WARNINGS ===");
  for (const w of result.warnings) console.log("- " + w);
}

const summarize = (rows: ForecastConsolidationRow[]) => {
  const byBand: Record<string, number> = {};
  const bySection: Record<string, number> = {};
  for (const r of rows) {
    byBand[r.band] = (byBand[r.band] ?? 0) + 1;
    bySection[r.section] = (bySection[r.section] ?? 0) + 1;
  }
  return { count: rows.length, byBand, bySection };
};

console.log("\n=== DRAFT WO ===", summarize(result.draftWorkOrder));
for (const r of result.draftWorkOrder) {
  const cat = r.catPracticeAutoInclude ? " [cat-practice]" : "";
  const est = r.gapEstimated ? " (est)" : "";
  console.log(
    `  [${r.band.padEnd(14)}] gap=${r.gapHours.toFixed(1).padStart(7)} ${r.direction.padEnd(20)} ${r.section.padEnd(12)} ${r.canonicalName}${cat}${est}`,
  );
}

console.log("\n=== FLAGGED FOR REVIEW ===", summarize(result.flaggedForReview));
for (const r of result.flaggedForReview) {
  const est = r.gapEstimated ? " (est)" : "";
  console.log(
    `  [${r.band.padEnd(14)}] gap=${r.gapHours.toFixed(1).padStart(7)} ${r.direction.padEnd(20)} ${r.section.padEnd(12)} ${r.canonicalName}${est}`,
  );
}

console.log("\n=== NEXT CYCLE (defer) ===", summarize(result.nextCycle));
for (const r of result.nextCycle.slice(0, 6)) {
  const est = r.gapEstimated ? " (est)" : "";
  console.log(
    `  [${r.band.padEnd(14)}] gap=${r.gapHours.toFixed(1).padStart(7)} ${r.direction.padEnd(20)} ${r.section.padEnd(12)} ${r.canonicalName}${est}`,
  );
}
if (result.nextCycle.length > 6) {
  console.log(`  … ${result.nextCycle.length - 6} more`);
}

if (result.unclassified.length > 0) {
  console.log(`\n=== UNCLASSIFIED (${result.unclassified.length}) ===`);
  for (const r of result.unclassified.slice(0, 5)) {
    console.log(`  [${r.section}] ${r.canonicalName}`);
  }
  if (result.unclassified.length > 5) {
    console.log(`  … ${result.unclassified.length - 5} more`);
  }
}
