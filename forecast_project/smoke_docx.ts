// One-off Node smoke test for src/forecast/docx.ts.
// Run with: npx tsx forecast_project/smoke_docx.ts forecast_project/training_data/OY-CAH.docx
// Validates that the TS docx primitive returns the same table shape as python-docx.

import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

// Polyfill for the docx parser (browser uses native DOMParser).
(globalThis as any).DOMParser = DOMParser;

import { parseDocx } from "../src/forecast/docx";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx smoke_docx.ts <file.docx>");
  process.exit(1);
}

const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const parsed = await parseDocx(ab as ArrayBuffer);
console.log(`pageHeaderText: ${JSON.stringify(parsed.pageHeaderText)}`);
console.log(`tables: ${parsed.tables.length}`);
parsed.tables.forEach((t, i) => {
  const all = (t.rows[0]?.cells ?? []).map((c) => c.text).filter(Boolean);
  const sig = all[0] ?? "(empty)";
  console.log(`  table ${i}: rows=${t.rows.length} non-empty-cells=${all.length} sample=${JSON.stringify(sig.slice(0, 80))}`);
});

// Find any cell containing "Projection List".
const hits: string[] = [];
parsed.tables.forEach((t, i) => {
  t.rows.forEach((r, ri) => {
    r.cells.forEach((c, ci) => {
      if (c.text.includes("Projection List")) hits.push(`t${i} r${ri} c${ci}: ${c.text}`);
    });
  });
});
console.log("\nProjection List hits:", hits);

// Echo the section table data rows for spot-check.
for (const t of parsed.tables) {
  const name = t.rows[0]?.cells[0]?.text;
  if (name === "Components" || name === "Tasks" || name === "AD's" || name === "Inspections") {
    console.log(`\n--- ${name} (${t.rows.length} rows) ---`);
    t.rows.slice(0, 4).forEach((r, idx) => {
      const cells = r.cells.map((c) => c.text.replace(/\n/g, " | "));
      console.log(`  R${idx} (${cells.length}):`, cells);
    });
  }
  // Header subtable
  if (name === "Aircraft Time") {
    console.log(`\n--- Aircraft Time ---`);
    t.rows.forEach((r, idx) => {
      console.log(`  R${idx}:`, r.cells.map((c) => c.text));
    });
  }
}
