// Number and date shapes used by the ERP's Aircraft Status report.
//
// The report is not internally consistent about decimal separators: hours and
// cycles print Danish ("13.730,90h", "20.039,00C") while the months figure in
// the Remaining cell prints English ("58.58month"). Parsing them with one
// routine would turn 3.42 months into 342. Hence two functions.

/** "13.730,90" → 13730.9 · "-5.835,50" → -5835.5 */
export function parseDanishNumber(raw: string): number | undefined {
  const m = raw.match(/^(-?[\d.]+),(\d{2})$/);
  if (!m) return undefined;
  const whole = m[1].replace(/\./g, "");
  const n = Number(`${whole}.${m[2]}`);
  return Number.isFinite(n) ? n : undefined;
}

/** "58.58" → 58.58 */
export function parseEnglishNumber(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** "13-07-2026" → Date. Returns undefined for shapes like 31-02-2026. */
export function parseDmyDate(raw: string): Date | undefined {
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return undefined;
  const day = Number(m[1]),
    month = Number(m[2]),
    year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  )
    return undefined;
  return d;
}

/**
 * The report's own header figures print with English grouping —
 * "13,709.45" — unlike every figure inside the table. Same number, different
 * convention, on the same page.
 */
export function parseHeaderNumber(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Collapses runs of whitespace so descriptions compare and print cleanly. */
export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
