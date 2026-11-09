"""Glossary extractor for the forecast module.

Walks training_data/*.docx and produces:
- cluster_review.md — human-readable per-model cluster inventory.
- event_dictionary.json — draft canonical mapping (SEP edits this directly).

Scoping rules (per SEP):
- Every model is its own bucket. TB-9 / TB-10 / TB-20 are distinct.
  P.68 and P.68 Observer are distinct.
- ADs cluster on (canonical AD number, engine side). Same AD on L/H vs
  R/H stays as two separate canonical events.
- Inspections / Components / Tasks cluster on a normalized name with
  Partenavia variant suffixes (P68B / P68C / P68B & C) stripped, so
  "100 hrs Inspection P68B & C" matches "100 hrs Inspection".
"""

from __future__ import annotations

import datetime as dt
import glob
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from docx import Document

# Mirrors src/seed/fleet.ts. Tails not present in training_data/ are omitted.
MODEL_BY_TAIL: dict[str, str] = {
    "OY-BUF": "C172M",
    "OY-CAC": "P.68",
    "OY-CAH": "TB-10",
    "OY-CAT": "BN2B-26 Islander",
    "OY-CDB": "TB-20",
    "OY-CDC": "P.68",
    "OY-CDJ": "TB-9",
    "OY-CDL": "TB-9",
    "OY-CDP": "TB-9",
    "OY-CDR": "TB-10",
    "OY-CDT": "TB-20",
    "OY-CDU": "TB-9",
    "OY-HHG": "R44",
    "OY-LKI": "P.68",
    "OY-OCM": "P.68",
    "OY-SUR": "P.68 Observer",
}

SECTIONS_OF_INTEREST = ("Components", "Tasks", "AD's", "Inspections")
SECTION_DISPLAY_ORDER = ("Inspections", "AD's", "Components", "Tasks")

TOLERANCE_RE = re.compile(
    r"[\s|]*Tolerance\s*[+\xb1±­�]?\s*\d.*$",
    re.IGNORECASE | re.DOTALL,
)
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
WHITESPACE_RE = re.compile(r"\s+")

# Trailing group qualifiers in the AD No. cell (e.g. "FAA 2026-04-11 | Engine"
# or "SB 70 REV 2 AIRFRAME GROUP"). These are categorisation tags, not part of
# the AD identifier.
AD_GROUP_QUALIFIER_RE = re.compile(
    r"\s+(?:AIRFRAME\s*GROUP|ENGINE|PROPELLER|AVIONICS|LANDING\s*GEAR)$",
    re.IGNORECASE,
)
# AD No. cells sometimes also carry an explicit side tag ("LH Engine", "R/H
# Engine"). Detect-and-strip in one pass so the canonical id is clean.
AD_SIDE_QUALIFIER_RE = re.compile(
    r"\s+(L/?H|R/?H)(?:\s+ENGINE)?$",
    re.IGNORECASE,
)
LH_RE = re.compile(r"\b(?:l/h|lh|left)\b", re.IGNORECASE)
RH_RE = re.compile(r"\b(?:r/h|rh|right)\b", re.IGNORECASE)

# Partenavia model-variant suffixes appended to inspection / lubrication names.
# We strip these when scoping is already by exact model — within "P.68",
# B and C are treated identically per maintenance program.
P68_VARIANT_RE = re.compile(
    r"\s*P\.?\s*68\s*[A-Z](?:\s*&\s*[A-Z])?\s*$",
    re.IGNORECASE,
)

# Patterns used to clean trailing serial / part identifiers from AD canonical
# titles. Per SEP: part S/Ns are noise — the CAMO system already maps the AD
# to the right tail.
PART_NOISE_PATTERNS = [
    # Trailing alnum token containing a digit (covers L-21968-51A, 75007602,
    # BL73808, RL-6146-48A, G-55-11749, 43813).
    re.compile(r"\s+[A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*\s*$", re.IGNORECASE),
    # Trailing part identifier with optional side (parens or bare).
    re.compile(
        r"[\s\.\,]+(?:Engine|Carburett?or|Transponder|Propeller)"
        r"(?:\s*\(?[LR]/?H\)?)?\s*$",
        re.IGNORECASE,
    ),
    # Trailing redundant side+Engine reference (", L/H Engine.").
    re.compile(r"[\s\.\,]+[LR]/?H\s+Engine\s*$", re.IGNORECASE),
]

# AD titles often repeat the AD/SB number in parens ("(SB 75 R3)", "(SB 91)").
# Strip those — the canonical number is already a separate field.
PARENTHETICAL_REF_RE = re.compile(
    r"\s*\(\s*(?:SB|AD|SI)[^)]*\)",
    re.IGNORECASE,
)

# Per SEP's same-action-collapse rule, AD titles shouldn't bake in a specific
# interval like "100 hr insp" / "400 hrs insp" — the canonical event covers
# every interval the SB defines. Replace with the generic "inspection".
INTERVAL_INSP_RE = re.compile(
    r"\s*[-–]?\s*\d+\s*(?:hrs?|hours?)\s+insp(?:ection)?\b",
    re.IGNORECASE,
)


def strip_part_identifiers(s: str) -> str:
    """Iteratively strip trailing part S/Ns and part-identifier tokens."""
    prev: str | None = None
    while prev != s:
        prev = s
        for pat in PART_NOISE_PATTERNS:
            s = pat.sub("", s).strip()
    return s.rstrip(" ,")


def strip_interval_from_title(s: str) -> str:
    """Replace embedded '100 hrs insp' / '400 hr inspection' with 'inspection'.

    Used on AD/SB titles where multiple intervals collapse to one canonical
    event (per SEP's same-action-smallest-interval rule).
    """
    cleaned = INTERVAL_INSP_RE.sub(" inspection", s, count=1)
    # Also drop parenthetical AD/SB references — number is in canonical_number.
    cleaned = PARENTHETICAL_REF_RE.sub("", cleaned)
    # Collapse whitespace introduced by substitutions.
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def title_compare_form(s: str) -> str:
    """Form used to detect whether two raw forms cleaned to the same title.

    Strips trailing punctuation (period, comma) since cleanup steps may eat
    or leave it inconsistently.
    """
    return s.rstrip(" .,").lower()


# Manual AD merge rules confirmed during the consolidation session with SEP.
# Each tuple: (model, source_canonical_number, target_canonical_number).
# Per SEP's AD-priority rule, when an SB is wrapped by a regulator AD, the
# AD number is canonical and the SB number becomes an alias.
AD_MERGE_RULES: list[tuple[str, str, str]] = [
    ("P.68", "SB 75 REV 3", "RAI PDA 96-337"),
    ("P.68", "SB 93", "RAI 96-032"),
    ("P.68", "SB 83", "RAI AD 1991-125"),
    ("P.68", "SB 113", "RAI AD 2002-415"),
    ("P.68", "SB 91", "RAI PDA 94-026"),
]

# Manual canonical-title overrides confirmed during the consolidation session.
# Keyed on (model, canonical_number, engine_side or ""). When the auto-derived
# title is noisy or misleading, the override wins.
CANONICAL_TITLE_OVERRIDES: dict[tuple[str, str, str], str] = {
    # P.68 — post-merge canonical titles for AD-wraps-SB clusters.
    # SB 113 is fundamentally an operational check of the fuel selector
    # control system; "rigging" is only the corrective action when the
    # check fails. Confirmed against SB 113 PDF.
    ("P.68", "RAI 96-032", ""): "Wing box area inspection",
    ("P.68", "RAI AD 1991-125", ""): "Exhaust muffler inspection",
    ("P.68", "RAI AD 2002-415", ""): "Fuel selector control system operational check",
    ("P.68", "RAI PDA 94-026", ""): "Flight control shelves inspection",
}


def lookup_title_override(model: str, canonical_number: str, side: str | None) -> str | None:
    return CANONICAL_TITLE_OVERRIDES.get((model, canonical_number, side or ""))


def strip_tolerance(s: str) -> str:
    s = TOLERANCE_RE.sub("", s)
    s = WHITESPACE_RE.sub(" ", s)
    return s.strip()


def strip_model_variant(s: str) -> str:
    """Strip Partenavia P68B / P68C / P68B & C suffix from a name."""
    return P68_VARIANT_RE.sub("", s).strip()


def normalize(s: str) -> str:
    s = s.lower()
    s = NON_ALNUM_RE.sub(" ", s)
    return " ".join(s.split())


def parse_ad_number(ad_no_full: str) -> tuple[str, str | None]:
    """Split an AD No. cell into (canonical_number, side_hint).

    `ad_no_full` may include a trailing " | <group>" suffix (we keep only
    everything before the first pipe), a trailing engine/airframe group
    qualifier, and/or an explicit side tag like "LH Engine".

    Returns the cleaned canonical number plus an optional side hint
    extracted from the qualifier itself ("L/H", "R/H", or None).
    """
    raw = ad_no_full.split("|", 1)[0].strip()

    side_hint: str | None = None
    m = AD_SIDE_QUALIFIER_RE.search(raw)
    if m:
        token = m.group(1).upper().replace("/", "")
        side_hint = "L/H" if token == "LH" else "R/H"
        raw = AD_SIDE_QUALIFIER_RE.sub("", raw).strip()

    raw = AD_GROUP_QUALIFIER_RE.sub("", raw).strip()
    return raw, side_hint


def detect_engine_side(*texts: str) -> str | None:
    """Return 'L/H' | 'R/H' | None based on description / AD No. content."""
    blob = " ".join(t for t in texts if t)
    has_lh = bool(LH_RE.search(blob))
    has_rh = bool(RH_RE.search(blob))
    if has_lh and not has_rh:
        return "L/H"
    if has_rh and not has_lh:
        return "R/H"
    return None


def section_data_rows(tbl):
    if len(tbl.rows) <= 2:
        return
    for row in list(tbl.rows)[2:]:
        cells = [c.text.strip() for c in row.cells]
        deduped: list[str] = []
        for c in cells:
            if not deduped or deduped[-1] != c:
                deduped.append(c)
        yield deduped


def cluster_key_and_payload(section: str, row: list[str]):
    """Return (cluster_key, payload_dict) for a data row, or None to skip."""
    if section == "Components":
        if len(row) < 2:
            return None
        raw_name = strip_tolerance(row[1])
        if not raw_name:
            return None
        return normalize(strip_model_variant(raw_name)), {"raw": raw_name}

    if section == "Tasks":
        if len(row) < 5:
            return None
        task_num = row[1]
        task_name = strip_tolerance(row[2])
        action = row[4]
        if not task_name:
            return None
        raw_name = f"{task_name} ({action})" if action else task_name
        return (
            normalize(strip_model_variant(raw_name)),
            {"raw": raw_name, "task_num": task_num},
        )

    if section == "AD's":
        if len(row) < 4:
            return None
        ad_no_full = strip_tolerance(row[1])
        canonical_number, side_from_no = parse_ad_number(ad_no_full)
        desc = strip_tolerance(row[2])
        ad_type = row[3]
        if not canonical_number:
            return None
        side = side_from_no or detect_engine_side(desc)
        # Cluster key bundles canonical number + side so L/H and R/H stay split.
        key = (canonical_number, side or "")
        return key, {
            "raw": desc,
            "ad_no_raw": ad_no_full,
            "canonical_number": canonical_number,
            "side": side,
            "type": ad_type,
        }

    if section == "Inspections":
        if len(row) < 2:
            return None
        raw_name = strip_tolerance(row[1])
        if not raw_name:
            return None
        return normalize(strip_model_variant(raw_name)), {"raw": raw_name}

    return None


def canonical_name_from_variants(raw_variants: list[str]) -> str:
    """Pick the most common raw form, with model-variant suffix stripped."""
    most_common = Counter(raw_variants).most_common(1)[0][0]
    cleaned = strip_model_variant(most_common).strip()
    return cleaned or most_common


def apply_ad_merges(clusters) -> None:
    """Apply manual SEP-confirmed AD merges (e.g. SB merged into wrapping AD)."""
    for model, src_no, tgt_no in AD_MERGE_RULES:
        ads = clusters.get(model, {}).get("AD's", {})
        if not ads:
            continue
        keys_to_merge = [k for k in list(ads) if k[0] == src_no]
        for key in keys_to_merge:
            new_key = (tgt_no, key[1])
            for occ in ads[key]:
                occ["canonical_number"] = tgt_no
            ads.setdefault(new_key, []).extend(ads.pop(key))


def collect_clusters() -> tuple[
    dict[str, dict[str, dict[tuple, list[dict]]]],
    list[str],
]:
    base = Path(__file__).parent
    training_dir = base / "training_data"
    docx_files = sorted(
        f for f in glob.glob(str(training_dir / "*.docx"))
        if not Path(f).name.startswith("~$")  # skip Word lock files
    )
    if not docx_files:
        raise SystemExit(f"No .docx files found in {training_dir}")

    clusters: dict[str, dict[str, dict[tuple, list[dict]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )
    skipped: list[str] = []

    for path in docx_files:
        tail = Path(path).stem
        model = MODEL_BY_TAIL.get(tail)
        if model is None:
            skipped.append(tail)
            continue

        doc = Document(path)
        for tbl in doc.tables:
            section = tbl.rows[0].cells[0].text.strip()
            if section not in SECTIONS_OF_INTEREST:
                continue
            for row in section_data_rows(tbl):
                result = cluster_key_and_payload(section, row)
                if result is None:
                    continue
                key, payload = result
                payload["tail"] = tail
                clusters[model][section][key].append(payload)

    return clusters, skipped


def emit_markdown(clusters, base: Path) -> int:
    out: list[str] = []
    out.append("# Forecast event glossary — cluster review")
    out.append("")
    out.append("Auto-generated from `training_data/*.docx` by `extractor.py`.")
    out.append("")
    out.append(
        "Scope: every model is its own bucket. **TB-9 / TB-10 / TB-20 are not merged. "
        "P.68 and P.68 Observer are not merged.**"
    )
    out.append("")
    out.append(
        "AD's cluster by (canonical AD number, engine side). Group qualifiers "
        "(`AIRFRAME GROUP`, `Engine`, side tags) are stripped from the AD No. "
        "before keying. Engine side is detected from the description; L/H and "
        "R/H stay as separate canonical events on multi-engine aircraft."
    )
    out.append("")
    out.append(
        "Inspections / Components / Tasks cluster on a normalized name with "
        "Partenavia variant suffixes (P68B / P68C / P68B & C) stripped."
    )
    out.append("")
    out.append(
        "**Walkthrough job:** confirm or correct each cluster's canonical "
        "name; flag clusters that should be split or merged. The structured "
        "edit happens in `event_dictionary.json` — this file is the human "
        "overview."
    )
    out.append("")

    total = 0
    for model in sorted(clusters):
        out.append(f"## {model}")
        out.append("")
        tails_in_model = sorted(t for t, m in MODEL_BY_TAIL.items() if m == model)
        out.append(f"_Tails: {', '.join(tails_in_model)}_")
        out.append("")
        for section in SECTION_DISPLAY_ORDER:
            items = clusters[model].get(section, {})
            if not items:
                continue
            total += len(items)
            out.append(f"### {section} ({len(items)} clusters)")
            out.append("")
            sorted_keys = sorted(
                items.items(),
                key=lambda kv: canonical_name_from_variants(
                    [o["raw"] for o in kv[1]]
                ).lower(),
            )
            for key, occurrences in sorted_keys:
                raw_variants = sorted({o["raw"] for o in occurrences})
                tails_seen = sorted({o["tail"] for o in occurrences})
                canonical = canonical_name_from_variants(
                    [o["raw"] for o in occurrences]
                )

                if section == "AD's":
                    canonical_number = occurrences[0]["canonical_number"]
                    side = occurrences[0]["side"]
                    side_label = f" [{side}]" if side else ""
                    canonical = strip_interval_from_title(strip_part_identifiers(canonical))
                    override = lookup_title_override(model, canonical_number, side)
                    if override is not None:
                        canonical = override
                    out.append(f"- **`{canonical_number}`{side_label}** — {canonical}")
                    raw_numbers = sorted({o["ad_no_raw"] for o in occurrences})
                    if len(raw_numbers) > 1:
                        out.append("  - raw AD No. variants:")
                        for v in raw_numbers:
                            out.append(f"    - `{v}`")
                    if len(raw_variants) > 1:
                        out.append("  - raw description variants:")
                        for v in raw_variants:
                            out.append(f"    - `{v}`")
                    types = sorted({o.get("type", "") for o in occurrences if o.get("type")})
                    if types:
                        out.append(f"  - type(s): {', '.join(types)}")
                else:
                    out.append(f"- **{canonical}**")
                    if len(raw_variants) > 1:
                        out.append("  - raw variants:")
                        for v in raw_variants:
                            out.append(f"    - `{v}`")
                    if section == "Tasks":
                        nums = sorted(
                            {
                                o.get("task_num", "")
                                for o in occurrences
                                if o.get("task_num")
                            }
                        )
                        if nums:
                            out.append(f"  - task #: {', '.join(nums)}")

                out.append(
                    f"  - seen on {len(tails_seen)} tail(s): {', '.join(tails_seen)}"
                )
            out.append("")

    (base / "cluster_review.md").write_text("\n".join(out), encoding="utf-8")
    return total


def emit_dictionary(clusters, base: Path) -> dict[str, int]:
    """Write event_dictionary.json — the editable canonical mapping draft."""
    doc = {
        "version": 1,
        "generated_at": dt.date.today().isoformat(),
        "generated_from": "training_data/*.docx via extractor.py",
        "rules": {
            "model_scoping": "every airframe model is its own bucket; TB-9 / TB-10 / TB-20 distinct, P.68 / P.68 Observer distinct",
            "ad_clustering": "key = (canonical AD number, engine side); group qualifiers stripped from AD number; L/H vs R/H stay split",
            "name_clustering": "Inspections / Components / Tasks normalized lowercase-alnum; Partenavia P68B / P68C / P68B & C suffix stripped before matching",
            "needs_review": "true when a cluster pulled in multiple raw variants — likely safe but worth a human glance",
        },
        "models": {},
    }

    summary = {"clusters_total": 0, "clusters_needing_review": 0}

    for model in sorted(clusters):
        model_entry: dict[str, list[dict]] = {}
        for section in SECTION_DISPLAY_ORDER:
            items = clusters[model].get(section, {})
            if not items:
                continue
            section_entries: list[dict] = []
            for key, occurrences in items.items():
                raw_variants = sorted({o["raw"] for o in occurrences})
                tails_seen = sorted({o["tail"] for o in occurrences})

                if section == "AD's":
                    canonical_number = occurrences[0]["canonical_number"]
                    side = occurrences[0]["side"]
                    canonical_title = strip_interval_from_title(
                        strip_part_identifiers(
                            canonical_name_from_variants(
                                [o["raw"] for o in occurrences]
                            )
                        )
                    )
                    override = lookup_title_override(model, canonical_number, side)
                    if override is not None:
                        canonical_title = override
                    raw_numbers = sorted({o["ad_no_raw"] for o in occurrences})
                    types = sorted({o.get("type", "") for o in occurrences if o.get("type")})
                    # Flag only when cleanup *fails* to reconcile the variants —
                    # i.e. cleaned descriptions still differ. Pure formatting
                    # differences that all reduce to the same cleaned title are
                    # noise, not ambiguity.
                    cleaned_descs = {
                        title_compare_form(
                            strip_interval_from_title(strip_part_identifiers(v))
                        )
                        for v in raw_variants
                    }
                    # A confirmed manual override resolves the cluster — no
                    # further review needed even if raw forms differ.
                    needs_review = len(cleaned_descs) > 1 and override is None
                    entry = {
                        "canonical_number": canonical_number,
                        "canonical_title": canonical_title,
                        "engine_side": side,
                        "raw_numbers": raw_numbers,
                        "raw_descriptions": raw_variants,
                        "types": types,
                        "tails": tails_seen,
                        "needs_review": needs_review,
                    }
                else:
                    canonical = canonical_name_from_variants(
                        [o["raw"] for o in occurrences]
                    )
                    # Same idea: only flag when raw variants reduce to different
                    # cleaned forms (i.e. real differences, not casing/spacing).
                    cleaned_variants = {
                        title_compare_form(strip_model_variant(v))
                        for v in raw_variants
                    }
                    needs_review = len(cleaned_variants) > 1
                    entry = {
                        "canonical": canonical,
                        "raw_variants": raw_variants,
                        "tails": tails_seen,
                        "needs_review": needs_review,
                    }
                    if section == "Tasks":
                        nums = sorted(
                            {
                                o.get("task_num", "")
                                for o in occurrences
                                if o.get("task_num")
                            }
                        )
                        if nums:
                            entry["task_nums_seen"] = nums

                section_entries.append(entry)
                summary["clusters_total"] += 1
                if entry["needs_review"]:
                    summary["clusters_needing_review"] += 1

            sort_key = (
                (lambda e: (e["canonical_number"].lower(), e.get("engine_side") or ""))
                if section == "AD's"
                else (lambda e: e["canonical"].lower())
            )
            section_entries.sort(key=sort_key)
            model_entry[section] = section_entries

        doc["models"][model] = model_entry

    doc["summary"] = summary

    (base / "event_dictionary.json").write_text(
        json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return summary


def main() -> None:
    base = Path(__file__).parent
    clusters, skipped = collect_clusters()
    apply_ad_merges(clusters)
    md_total = emit_markdown(clusters, base)
    summary = emit_dictionary(clusters, base)

    print(f"Wrote cluster_review.md ({md_total} clusters)")
    print(
        f"Wrote event_dictionary.json "
        f"({summary['clusters_total']} clusters, "
        f"{summary['clusters_needing_review']} flagged needs_review)"
    )
    for model in sorted(clusters):
        by_section = {
            s: len(clusters[model].get(s, {})) for s in SECTION_DISPLAY_ORDER
        }
        print(f"  {model}: {by_section}")
    if skipped:
        print(f"Skipped (no model in seed): {skipped}")


if __name__ == "__main__":
    main()
