// Durations (TTAF, log_time_left, timer_expiry_time) are stored as integer
// minutes. Display uses `HHHH:MM`. Two input formats are supported and
// disambiguated by separator:
//   • `HHHH:MM` — sexagesimal (e.g. 6466:36 → 6466h 36m)
//   • `HHHH.MM` — decimal hours (e.g. 4969.5 → 4969h 30m)
// `parseDurationToMinutes` only handles `:`. Use `parseTtafInput` for UI
// inputs that should auto-detect between the two formats.

export function parseDurationToMinutes(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (!match) {
    // Allow plain integer hours (no minutes part).
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) * 60;
    return null;
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (minutes > 59) return null;
  return hours * 60 + minutes;
}

// Parses decimal hours (e.g. "4969.5" → 298170 min, "4 969.5" → 298170 min).
// Strips thousands-spaces (CAMO formats numbers with them). Rounds to nearest minute.
export function parseDecimalHoursToMinutes(input: string): number | null {
  if (!input) return null;
  const stripped = input.replace(/\s+/g, "");
  if (!stripped) return null;
  if (!/^\d+(\.\d+)?$/.test(stripped)) return null;
  const hours = parseFloat(stripped);
  if (!isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 60);
}

export type TtafFormat = "hhmm" | "decimal";

// Picks which format the user appears to be typing. Used both for parsing
// and to drive a live "detected format" indicator next to the input.
export function detectTtafFormat(input: string): TtafFormat {
  const trimmed = input.trim();
  if (trimmed.includes(":")) return "hhmm";
  if (trimmed.includes(".")) return "decimal";
  return "hhmm";
}

// Auto-dispatches between `:` (HH:MM) and `.` (decimal hours) based on
// which separator is present. Plain integers are unambiguous.
export function parseTtafInput(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return detectTtafFormat(trimmed) === "decimal"
    ? parseDecimalHoursToMinutes(trimmed)
    : parseDurationToMinutes(trimmed);
}

export function formatMinutesAsDuration(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function formatHoursLeft(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${m.toString().padStart(2, "0")}`;
}
