export function deriveInitialsFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const segments = localPart
    .split(/[._-]+/)
    .map((seg) => seg.replace(/\d+/g, ""))
    .filter(Boolean);

  if (segments.length === 0) {
    const fallback = localPart.replace(/[^a-zA-Z]/g, "").slice(0, 3);
    return fallback.toUpperCase() || "XX";
  }

  if (segments.length === 1) {
    return segments[0].slice(0, 4).toUpperCase();
  }

  return segments
    .map((seg) => seg[0] ?? "")
    .join("")
    .slice(0, 4)
    .toUpperCase();
}
