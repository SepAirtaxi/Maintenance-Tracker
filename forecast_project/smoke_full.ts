// End-to-end smoke for parseForecast.
// Usage: npx tsx forecast_project/smoke_full.ts <docx-path> <model>
// e.g.   npx tsx forecast_project/smoke_full.ts training_data/OY-CAH.docx TB-10

import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as any).DOMParser = DOMParser;

import { parseForecast } from "../src/forecast/parseForecast";

const path = process.argv[2];
const model = process.argv[3];
if (!path || !model) {
  console.error("Usage: tsx smoke_full.ts <file.docx> <model>");
  process.exit(1);
}

const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const parsed = await parseForecast(ab as ArrayBuffer, { model });
console.log("HEADER:", parsed.header);

const total = parsed.rows.length;
const needsReview = parsed.rows.filter((r) => r.needsReview).length;
console.log(`\nROWS: ${total} total, ${needsReview} need review`);

const bySection: Record<string, { total: number; needsReview: number }> = {};
for (const r of parsed.rows) {
  const s = (bySection[r.section] ??= { total: 0, needsReview: 0 });
  s.total += 1;
  if (r.needsReview) s.needsReview += 1;
}
console.log("By section:", bySection);

if (needsReview > 0) {
  console.log("\nNeeds-review rows:");
  for (const r of parsed.rows.filter((x) => x.needsReview)) {
    console.log(`  [${r.section}] raw=${JSON.stringify(r.rawName)}${r.adNumberRaw ? ` adNo=${JSON.stringify(r.adNumberRaw)}` : ""}`);
  }
}

console.log("\nFirst 3 resolved rows:");
for (const r of parsed.rows.slice(0, 3)) console.dir(r, { depth: 4 });
