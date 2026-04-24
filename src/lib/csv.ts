import Papa from "papaparse";
import { parse as parseDate, isValid } from "date-fns";
import { parseDurationToMinutes } from "@/lib/time";

export type CsvRow = {
  callSign: string;
  warning: string;
  daysLeftRaw: string;
  logTimeLeftMinutes: number | null;
  expiryDate: Date | null;
  timerExpiryTimeMinutes: number | null;
};

export type CsvParseResult = {
  rows: CsvRow[];
  invalidRows: Array<{ lineNumber: number; reason: string; raw: string }>;
};

const REQUIRED_COLUMNS = [
  "call_sign",
  "warning",
  "days_left",
  "log_time_left",
  "expiry_date",
  "timer_expiry_time",
] as const;

function parseCsvDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Try dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy
  for (const fmt of ["dd.MM.yyyy", "dd/MM/yyyy", "dd-MM-yyyy"]) {
    const parsed = parseDate(trimmed, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const fields = result.meta.fields ?? [];
        const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
        if (missing.length > 0) {
          reject(
            new Error(
              `CSV is missing required columns: ${missing.join(", ")}. Got: ${fields.join(", ")}`,
            ),
          );
          return;
        }

        const rows: CsvRow[] = [];
        const invalidRows: CsvParseResult["invalidRows"] = [];

        result.data.forEach((raw, idx) => {
          const lineNumber = idx + 2; // +2 for header + 1-based
          const callSign = (raw.call_sign ?? "").trim().toUpperCase();
          const warning = (raw.warning ?? "").trim();

          if (!callSign) {
            invalidRows.push({
              lineNumber,
              reason: "Missing call_sign",
              raw: JSON.stringify(raw),
            });
            return;
          }
          if (!warning) {
            invalidRows.push({
              lineNumber,
              reason: "Missing warning",
              raw: JSON.stringify(raw),
            });
            return;
          }

          rows.push({
            callSign,
            warning,
            daysLeftRaw: (raw.days_left ?? "").trim(),
            logTimeLeftMinutes: parseDurationToMinutes(
              (raw.log_time_left ?? "").trim(),
            ),
            expiryDate: parseCsvDate(raw.expiry_date ?? ""),
            timerExpiryTimeMinutes: parseDurationToMinutes(
              (raw.timer_expiry_time ?? "").trim(),
            ),
          });
        });

        resolve({ rows, invalidRows });
      },
      error: (err) => reject(err),
    });
  });
}
