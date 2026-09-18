// The identity block above the table. Printed on every page; we read page 1.

import type { ComplianceHeader, TextItem } from "./types";
import { headerBottom, groupIntoRows } from "./layout";
import { parseHeaderNumber, parseDmyDate, squash } from "./text";

// Values are matched by their printed label rather than by position: the block
// is two rows of four label/value pairs, and which row a value lands on shifts
// between reports (OY-CDU prints Current Hours on the second row, OY-CAT on the
// first). The labels themselves are stable across every sample.
//
// Each label is read within its own printed line, so a value can never be
// captured from the line below it.
function field(
  lines: string[],
  label: string,
  pattern: string,
): string | undefined {
  const re = new RegExp(`${label}\\s*:?\\s*(${pattern})`, "i");
  for (const line of lines) {
    const m = line.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

export function parseComplianceHeader(items: TextItem[]): ComplianceHeader {
  const page1 = items.filter((i) => i.page === 1);
  const cutoff = headerBottom(items);
  const lines = groupIntoRows(page1.filter((i) => i.top < cutoff)).map(
    (row) => squash(row.map((i) => i.text).join(" ")),
  );

  // The tail appears twice — in the "Scan Criteria" box and again on the
  // identity line. Both carry the same value.
  const tailNumber = (field(lines, "Tail Number", "[A-Z]{1,2}-[A-Z0-9]{2,5}") ?? "")
    .toUpperCase()
    .trim();

  // Free-text fields run until the next label, so they stop at whatever label
  // follows them on the line.
  const untilNextLabel =
    ".+?(?=\\s+(?:Total|Model|Description|Manufacturer|Current|Hours at)\\b|$)";

  const totalHoursRaw = field(lines, "Total Hours", "[\\d,.]+");
  const totalCyclesRaw = field(lines, "Total Cycles", "[\\d,.]+");

  // "Printed on 18/09/2026 at 7:40:43" sits in the page footer, below the
  // table body, so it needs the whole page rather than the header band. It
  // tells the user how stale the upload is.
  const printed = squash(page1.map((i) => i.text).join(" ")).match(
    /Printed on (\d{2})\/(\d{2})\/(\d{4})/,
  );

  return {
    tailNumber,
    manufacturer: field(lines, "Manufacturer", untilNextLabel),
    model: field(lines, "Model", untilNextLabel),
    description: field(lines, "Description", untilNextLabel),
    totalHours: totalHoursRaw ? parseHeaderNumber(totalHoursRaw) : undefined,
    totalCycles: totalCyclesRaw ? parseHeaderNumber(totalCyclesRaw) : undefined,
    printedOn: printed
      ? parseDmyDate(`${printed[1]}-${printed[2]}-${printed[3]}`)
      : undefined,
  };
}
