// Orchestrator: docx blob → parsed header + canonical forecast rows.
//
// Exposes two phases so the UI can read the tail from the header (to look up
// the aircraft model in Maintenance Tracker) before applying the dictionary:
//   1. parseForecastUnresolved(input) → header + raw rows (model-agnostic).
//   2. resolveRows(rawRows, model)    → canonical-resolved rows.
// The single-shot parseForecast(input, { model }) wraps both.

import { parseDocx } from "./docx";
import { parseHeader } from "./parseHeader";
import { parseAllSections, type RawRow } from "./parseSection";
import { lookupName, lookupAd } from "./dictionary";
import type { ForecastHeader, ForecastParse, ForecastRow } from "./types";

export type UnresolvedParse = {
  header: ForecastHeader;
  rawRows: RawRow[];
};

export async function parseForecastUnresolved(
  input: ArrayBuffer | Blob,
): Promise<UnresolvedParse> {
  const docx = await parseDocx(input);
  return {
    header: parseHeader(docx),
    rawRows: parseAllSections(docx.tables),
  };
}

export function resolveRows(rawRows: RawRow[], model: string): ForecastRow[] {
  return rawRows.map((r) => resolveRow(r, model));
}

export type ParseOptions = {
  model: string;
};

export async function parseForecast(
  input: ArrayBuffer | Blob,
  opts: ParseOptions,
): Promise<ForecastParse> {
  const u = await parseForecastUnresolved(input);
  return { header: u.header, rows: resolveRows(u.rawRows, opts.model) };
}

function resolveRow(raw: RawRow, model: string): ForecastRow {
  const base: ForecastRow = {
    section: raw.section,
    rawName: raw.rawName,
    canonicalName: raw.rawName,
    needsReview: true,
    serialNo: raw.serialNo,
    taskNum: raw.taskNum,
    ataCode: raw.ataCode,
    action: raw.action,
    adNumberRaw: raw.adNumberRaw,
    adType: raw.adType,
    engineSide: raw.engineSide,
    tolerancePct: raw.tolerancePct,
    limit: raw.limit,
    performed: raw.performed,
    due: raw.due,
    remaining: raw.remaining,
  };

  if (raw.section === "AD's") {
    if (!raw.adNumberCleaned) return base;
    const hit = lookupAd(model, raw.adNumberCleaned, raw.engineSide);
    if (!hit) {
      // Unmapped — keep the raw AD number visible as the canonical fallback so
      // the row stays meaningful in the UI.
      return {
        ...base,
        canonicalName: raw.adNumberCleaned,
        adNumberCanonical: raw.adNumberCleaned,
      };
    }
    return {
      ...base,
      canonicalName: hit.canonicalName,
      adNumberCanonical: hit.adNumberCanonical,
      needsReview: false,
    };
  }

  const hit = lookupName(model, raw.section, raw.rawName);
  if (!hit) return base;
  return { ...base, canonicalName: hit.canonicalName, needsReview: false };
}
