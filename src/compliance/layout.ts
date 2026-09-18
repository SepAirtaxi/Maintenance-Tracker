// Rebuilds the report's table from positioned text runs.
//
// The ERP prints this through Crystal Reports, which lays every cell at a fixed
// x for its column and simply omits a cell when it is empty. Verified identical
// across OY-CAT (Britten-Norman, 8 pages), OY-CDC (Vulcanair, 6 pages) and
// OY-CDU (Daher, 5 pages): same page box, same column origins, no run landing
// outside a band. So the table is recovered by x, not by guessing at
// whitespace — which is what makes this parse reliable rather than heuristic.

import type { ComplianceRecord, TextItem } from "./types";
import { squash } from "./text";

// Left edge of each column, as printed. The bands run to the next column's
// edge; the last one stops short of the page footer's "Ref. NN" stamp, which
// sits at x≈754 and would otherwise fall inside Compliance Due.
const COLUMNS = [
  { key: "event", from: 8, to: 70 },
  { key: "desc", from: 70, to: 250 },
  { key: "ata", from: 250, to: 300 },
  { key: "status", from: 300, to: 390 },
  { key: "freq", from: 390, to: 457 },
  { key: "last", from: 457, to: 555 },
  { key: "rem", from: 555, to: 650 },
  { key: "due", from: 650, to: 760 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
type Cells = Record<ColumnKey, string[]>;

// Runs on the same printed line can differ by a fraction of a point.
const ROW_TOLERANCE = 2;
// Clearance either side of the heading and footer rules.
const GAP = 3;

// The table body is found per page rather than at a fixed height, because the
// page-one header block is taller than the one repeated on continuation pages:
// the table starts at y≈204 on page 1 but at y≈148 from page 2 on. A fixed
// cutoff silently swallows the first few printed lines of every later page —
// which loses whole records, since a record's opening line is the one carrying
// its Status, description and deadline.
function bodyBounds(
  pageItems: TextItem[],
): { top: number; bottom: number } | null {
  const heading = pageItems.find(
    (i) => i.text === "Frequency" && i.x > 380 && i.x < 410,
  );
  // A page with no column heading carries no table — the last page of a report
  // holds only "*** End of Document ***".
  if (!heading) return null;
  const footer = pageItems.find((i) => i.text.startsWith("AircraftStatus.rpt"));
  return {
    top: heading.top + GAP,
    bottom: (footer ? footer.top : Number.POSITIVE_INFINITY) - GAP,
  };
}

/** Where page one's identity block ends — everything above the column heading. */
export function headerBottom(items: TextItem[]): number {
  const heading = items.find(
    (i) => i.page === 1 && i.text === "Frequency" && i.x > 380 && i.x < 410,
  );
  return heading ? heading.top - GAP : Number.POSITIVE_INFINITY;
}

function emptyCells(): Cells {
  return {
    event: [],
    desc: [],
    ata: [],
    status: [],
    freq: [],
    last: [],
    rem: [],
    due: [],
  };
}

function columnFor(x: number): ColumnKey | null {
  for (const c of COLUMNS) if (x >= c.from && x < c.to) return c.key;
  return null;
}

// Descriptions are prose and the event type is a label ("Service" / "Bulletin"
// stacked over two lines), so those runs join with a space. Every other column
// holds one value that the report breaks wherever it runs out of width —
// "2.000,00H|36c" + "m" — so those join tight, or the limit comes out wrong.
function joinCell(key: ColumnKey, parts: string[]): string {
  return key === "desc" || key === "event"
    ? squash(parts.join(" "))
    : parts.join("");
}

/**
 * Groups runs that share a printed line.
 *
 * Needed rather than a plain sort by `top` because a label and its value are
 * drawn as separate fields and land on baselines a fraction of a point apart —
 * in the identity block, every label sits 0.25pt below its own value. Sorting
 * strictly by `top` therefore returns all the values, then all the labels.
 */
export function groupIntoRows(
  items: TextItem[],
  tolerance = ROW_TOLERANCE,
): TextItem[][] {
  const rows: { top: number; items: TextItem[] }[] = [];
  for (const it of [...items].sort((a, b) => a.top - b.top)) {
    const row = rows.find((r) => Math.abs(r.top - it.top) <= tolerance);
    if (row) row.items.push(it);
    else rows.push({ top: it.top, items: [it] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x));
}

function byPage(items: TextItem[]): Map<number, TextItem[]> {
  const map = new Map<number, TextItem[]>();
  for (const it of items) {
    const list = map.get(it.page);
    if (list) list.push(it);
    else map.set(it.page, [it]);
  }
  return map;
}

/** Groups body runs into printed lines, in page order. */
function toLines(items: TextItem[]): { page: number; cells: Cells }[] {
  const lines: { page: number; cells: Cells }[] = [];
  const pages = byPage(items);

  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    const pageItems = pages.get(page)!;
    const bounds = bodyBounds(pageItems);
    if (!bounds) continue;

    const body = pageItems.filter(
      (i) => i.top > bounds.top && i.top < bounds.bottom,
    );
    for (const row of groupIntoRows(body)) {
      const cells = emptyCells();
      for (const it of row) {
        const key = columnFor(it.x);
        if (key) cells[key].push(it.text);
      }
      lines.push({ page, cells });
    }
  }
  return lines;
}

/**
 * Turns printed lines into records.
 *
 * A record can span several lines — a long description wraps, and so does a
 * dual-limit frequency. The Event column can't mark where a record starts
 * because it is blank on rows whose description pushed it down. The Status
 * column can: it is filled on the first line of every record and never on a
 * continuation line.
 */
export function parseRecords(items: TextItem[]): ComplianceRecord[] {
  const records: ComplianceRecord[] = [];
  let open: { page: number; cells: Cells } | null = null;

  const flush = (pending: { page: number; cells: Cells } | null) => {
    if (!pending) return;
    const c = pending.cells;
    records.push({
      eventType: joinCell("event", c.event),
      description: joinCell("desc", c.desc),
      ataCode: joinCell("ata", c.ata) || undefined,
      status: joinCell("status", c.status),
      frequencyRaw: joinCell("freq", c.freq),
      lastComplianceRaw: joinCell("last", c.last),
      remainingRaw: joinCell("rem", c.rem),
      complianceDueRaw: joinCell("due", c.due),
      page: pending.page,
    });
  };

  for (const line of toLines(items)) {
    // The closing "*** End of Document ***" is centred, which drops it in the
    // Status column and would otherwise open a record of its own.
    if (line.cells.status.join("").includes("***")) continue;

    if (line.cells.status.length > 0) {
      flush(open);
      open = { page: line.page, cells: line.cells };
      continue;
    }
    if (!open) continue; // stray run above the first record
    for (const { key } of COLUMNS) open.cells[key].push(...line.cells[key]);
  }
  flush(open);

  return records;
}
