// Durations (TTAF, log_time_left, timer_expiry_time) are expressed as
// HHHH:MM (Flightlogger CSV) or HHHH.MM (CAMO convention). Both mean the same
// thing: hours + minutes-in-base-60. NOT decimal hours. We store as total
// minutes (integer) and render with `.` separator.

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

export function formatMinutesAsDuration(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}.${m.toString().padStart(2, "0")}`;
}

export function formatHoursLeft(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}.${m.toString().padStart(2, "0")}`;
}
