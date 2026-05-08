// Smoke test for parseHeader + parseAllSections against a real training docx.
// Usage: npx tsx forecast_project/smoke_parsers.ts <path-to-docx>

import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as any).DOMParser = DOMParser;

import { parseDocx } from "../src/forecast/docx";
import { parseHeader } from "../src/forecast/parseHeader";
import { parseAllSections } from "../src/forecast/parseSection";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx smoke_parsers.ts <file.docx>");
  process.exit(1);
}

const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const docx = await parseDocx(ab as ArrayBuffer);
const header = parseHeader(docx);
const rows = parseAllSections(docx.tables);

console.log("HEADER:", header);
console.log(`\nROWS: ${rows.length} total`);
const bySection: Record<string, number> = {};
for (const r of rows) bySection[r.section] = (bySection[r.section] ?? 0) + 1;
console.log("By section:", bySection);

console.log("\nFirst 2 of each section:");
for (const section of ["Inspections", "AD's", "Components", "Tasks"] as const) {
  const sample = rows.filter((r) => r.section === section).slice(0, 2);
  console.log(`\n--- ${section} ---`);
  for (const r of sample) console.dir(r, { depth: 4 });
}
