// Text utilities mirroring forecast_project/extractor.py — kept in lockstep so
// runtime lookups hit the same canonicalization the dictionary was built with.

import type { EngineSide } from "./types";

const TOLERANCE_RE = /[\s|]*Tolerance\s*[+±­ï¿½-]?\s*(\d+(?:\.\d+)?)\s*%?.*$/is;
const NON_ALNUM_RE = /[^a-z0-9]+/g;
const WHITESPACE_RE = /\s+/g;
const P68_VARIANT_RE = /\s*P\.?\s*68\s*[A-Z](?:\s*&\s*[A-Z])?\s*$/i;

const AD_GROUP_QUALIFIER_RE =
  /\s+(?:AIRFRAME\s*GROUP|ENGINE|PROPELLER|AVIONICS|LANDING\s*GEAR)$/i;
const AD_SIDE_QUALIFIER_RE = /\s+(L\/?H|R\/?H)(?:\s+ENGINE)?$/i;
const LH_RE = /\b(?:l\/h|lh|left)\b/i;
const RH_RE = /\b(?:r\/h|rh|right)\b/i;

// Strip a trailing "Tolerance ±N%" from a name cell. Returns the cleaned name
// and the parsed tolerance percent (or undefined if absent).
export function extractTolerance(s: string): { name: string; pct?: number } {
  const m = s.match(TOLERANCE_RE);
  if (!m) return { name: s.replace(WHITESPACE_RE, " ").trim() };
  const pct = Number(m[1]);
  const cleaned = s.replace(TOLERANCE_RE, "").replace(WHITESPACE_RE, " ").trim();
  return { name: cleaned, pct: Number.isFinite(pct) ? pct : undefined };
}

// Lowercase, alnum-only, single-spaced. Matches extractor.normalize().
export function normalize(s: string): string {
  return s.toLowerCase().replace(NON_ALNUM_RE, " ").trim().replace(WHITESPACE_RE, " ");
}

// Strip Partenavia variant suffix (P68B / P68C / P68B & C) for fuzzy match.
export function stripModelVariant(s: string): string {
  return s.replace(P68_VARIANT_RE, "").trim();
}

// Parse an AD No. cell (e.g. "FAA 2026-04-11 | Engine" or "RAI AD 1991-125
// AIRFRAME GROUP\nLH Engine") into a canonical number plus a side hint.
export function parseAdNumber(adNoFull: string): {
  canonicalNumber: string;
  sideHint?: EngineSide;
} {
  // python-docx style: drop everything after first "|" pipe.
  let raw = adNoFull.split("|", 1)[0];
  // The cell may also stack qualifiers as a second paragraph — collapse newlines.
  raw = raw.replace(/\n/g, " ").trim();

  let sideHint: EngineSide | undefined;
  const sideMatch = raw.match(AD_SIDE_QUALIFIER_RE);
  if (sideMatch) {
    const token = sideMatch[1].toUpperCase().replace("/", "");
    sideHint = token === "LH" ? "L/H" : "R/H";
    raw = raw.replace(AD_SIDE_QUALIFIER_RE, "").trim();
  }
  raw = raw.replace(AD_GROUP_QUALIFIER_RE, "").trim();
  return { canonicalNumber: raw, sideHint };
}

export function detectEngineSide(...texts: string[]): EngineSide | undefined {
  const blob = texts.filter(Boolean).join(" ");
  const hasLh = LH_RE.test(blob);
  const hasRh = RH_RE.test(blob);
  if (hasLh && !hasRh) return "L/H";
  if (hasRh && !hasLh) return "R/H";
  return undefined;
}

// Danish month abbreviations as they appear in CAMO exports.
const DANISH_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

// Parse a date string like "maj 5, 2026" / "maj 5,2027" / "apr 25, 2024".
// Returns undefined for unparseable input.
export function parseDanishDate(input: string): Date | undefined {
  const m = input.trim().toLowerCase().match(/^([a-zæøå]+)\s+(\d{1,2})\s*,\s*(\d{4})$/);
  if (!m) return undefined;
  const month = DANISH_MONTHS[m[1]];
  if (month === undefined) return undefined;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return undefined;
  return new Date(year, month, day);
}

// Parse a TTAF token like "13594.80H" or "14 158.2" — returns hours as a number.
export function parseTtafHours(input: string): number | undefined {
  const cleaned = input.replace(/\s+/g, "").replace(/H$/i, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

// Parse a calendar interval token like "144.00M" — returns months. Tolerates
// negative values for remaining ("3.53M", "-5.77M").
export function parseMonths(input: string): number | undefined {
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*M$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

// Parse a Limit / Perf. / Due / Rem. cell that may stack an hours line and a
// calendar line. Returns whichever it finds.
export type StackedCell = {
  hours?: number;
  months?: number;
  date?: Date;
};

export function parseStackedCell(cell: string): StackedCell {
  if (!cell) return {};
  const out: StackedCell = {};
  for (const lineRaw of cell.split(/\n+/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    // Hours line: "13594.80H" or negative "-171.90H".
    if (/^-?\d+(?:\.\d+)?\s*H$/i.test(line)) {
      out.hours = Number(line.replace(/\s*H$/i, ""));
      continue;
    }
    // Months line: "144.00M" / "-5.77M".
    const m = parseMonths(line);
    if (m !== undefined) {
      out.months = m;
      continue;
    }
    // Date line: "apr 25, 2024".
    const d = parseDanishDate(line);
    if (d) {
      out.date = d;
      continue;
    }
    // TTAF without H suffix (Aircraft Time table style): "14 158.2".
    if (/^\d[\d\s]*\.\d+$/.test(line)) {
      const n = parseTtafHours(line);
      if (n !== undefined) out.hours = n;
    }
  }
  return out;
}
