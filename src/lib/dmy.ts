// DD-MM-YYYY handling for typed date fields. Typed as digits; dashes are
// inserted for you.

export function maskDmy(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("-");
}

export function parseDmy(v: string): Date | null {
  const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const day = +m[1],
    month = +m[2],
    year = +m[3];
  const d = new Date(year, month - 1, day);
  // Rejects 31-02-2026 and friends — the Date constructor would roll them over.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
    return null;
  return d;
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function isoToDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
