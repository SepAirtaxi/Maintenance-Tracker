// Loads forecast_project/event_dictionary.json (the locked canonical mapping
// produced during the glossary phase) and builds keyed indexes so the runtime
// parser can resolve raw forecast rows to canonical names without re-running
// the consolidation logic.

import dictRaw from "../../forecast_project/event_dictionary.json";
import type { EngineSide, ForecastSection } from "./types";
import { normalize, parseAdNumber, stripModelVariant } from "./text";

// ---- Dictionary file shape (mirrors extractor.py emit_dictionary) -----------

type NameEntry = {
  canonical: string;
  raw_variants: string[];
  tails: string[];
  needs_review: boolean;
  task_nums_seen?: string[];
};

type AdEntry = {
  canonical_number: string;
  canonical_title: string;
  engine_side: EngineSide | null;
  raw_numbers: string[];
  raw_descriptions: string[];
  types: string[];
  tails: string[];
  needs_review: boolean;
};

type ModelEntry = Partial<{
  Inspections: NameEntry[];
  Components: NameEntry[];
  Tasks: NameEntry[];
  "AD's": AdEntry[];
}>;

type DictionaryFile = {
  version: number;
  generated_at: string;
  models: Record<string, ModelEntry>;
};

const dict = dictRaw as DictionaryFile;

// ---- Indexes ----------------------------------------------------------------

export type LookupHit = {
  canonicalName: string;
  // For AD's, the canonical AD/SB number that wins after merge rules.
  adNumberCanonical?: string;
};

// Components / Tasks / Inspections key: normalize(stripModelVariant(rawName)).
// This must mirror the extractor's clustering exactly — every raw_variant in
// the dictionary gets indexed, plus the canonical itself, so live forms that
// match either resolve to the same entry.
function nameKey(raw: string): string {
  return normalize(stripModelVariant(raw));
}

// AD key: normalize(adNumber) + "|" + (side ?? ""). Indexes both the canonical
// number and every raw variant so a live forecast still reporting a wrapped SB
// resolves to the wrapping AD.
function adKey(adNumber: string, side: EngineSide | undefined | null): string {
  return `${normalize(adNumber)}|${side ?? ""}`;
}

type SectionIndex = Map<string, LookupHit>;
type ModelIndex = Map<ForecastSection, SectionIndex>;

const indexByModel: Map<string, ModelIndex> = (() => {
  const out = new Map<string, ModelIndex>();
  for (const [model, sections] of Object.entries(dict.models)) {
    const modelIdx: ModelIndex = new Map();
    for (const section of ["Inspections", "Components", "Tasks"] as const) {
      const entries = sections[section];
      if (!entries) continue;
      const idx: SectionIndex = new Map();
      for (const e of entries) {
        const hit: LookupHit = { canonicalName: e.canonical };
        idx.set(nameKey(e.canonical), hit);
        for (const v of e.raw_variants) idx.set(nameKey(v), hit);
      }
      modelIdx.set(section, idx);
    }
    const ads = sections["AD's"];
    if (ads) {
      const idx: SectionIndex = new Map();
      for (const e of ads) {
        const hit: LookupHit = {
          canonicalName: e.canonical_title,
          adNumberCanonical: e.canonical_number,
        };
        const side = e.engine_side ?? null;
        idx.set(adKey(e.canonical_number, side), hit);
        // Apply the same parseAdNumber cleanup the runtime uses, so dictionary
        // entries like "SB 93 AIRFRAME GROUP" or "RAI AD 1991-125 Engine"
        // index under the same key the runtime produces ("sb 93", "rai ad
        // 1991-125") after stripping group/side qualifiers.
        for (const rn of e.raw_numbers) {
          idx.set(adKey(rn, side), hit);
          const cleaned = parseAdNumber(rn).canonicalNumber;
          if (cleaned && cleaned !== rn) idx.set(adKey(cleaned, side), hit);
        }
      }
      modelIdx.set("AD's", idx);
    }
    out.set(model, modelIdx);
  }
  return out;
})();

// ---- Public API -------------------------------------------------------------

export function knownModels(): string[] {
  return [...indexByModel.keys()].sort();
}

export function isModelKnown(model: string): boolean {
  return indexByModel.has(model);
}

export function lookupName(
  model: string,
  section: Exclude<ForecastSection, "AD's">,
  rawName: string,
): LookupHit | undefined {
  return indexByModel.get(model)?.get(section)?.get(nameKey(rawName));
}

export function lookupAd(
  model: string,
  adNumber: string,
  side: EngineSide | undefined,
): LookupHit | undefined {
  const idx = indexByModel.get(model)?.get("AD's");
  if (!idx) return undefined;
  // Try with side, then fall back to no-side (legacy entries / single-engine).
  return idx.get(adKey(adNumber, side)) ?? idx.get(adKey(adNumber, null));
}
