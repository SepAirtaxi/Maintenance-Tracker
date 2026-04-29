// Durations (TTAF, log_time_left, timer_expiry_time) are stored as integer
// minutes (base-60). Display uses `HHHH:MM`. Inputs accept either
// `HHHH:MM` or `HHHH.MM` (Flightlogger CSV uses `:`, older CAMO files use `.`).
// Decimal hours (`4969.5` = 4969h 30m) are NOT accepted by parseDurationToMinutes
// — use parseDecimalHoursToMinutes for that path.

export function parseDurationToMinutes(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+)[:.](\d{1,2})$/);
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

export function formatMinutesAsDuration(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

// Formats integer minutes as decimal hours (e.g. 298170 → "4969.5").
// Used when showing/seeding a decimal-hours input.
export function formatMinutesAsDecimalHours(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return "";
  const hours = minutes / 60;
  // Trim trailing zeros: 4969.0 → "4969", 4969.5 → "4969.5", 4969.51 → "4969.51".
  return parseFloat(hours.toFixed(2)).toString();
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
