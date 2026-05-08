# Forecast Module — Master Plan

Consolidated from planning sessions. This is the source of truth; if a future session contradicts it, trust this doc unless explicitly updated.

## Goal

A forecasting tool that ingests the CAMO ForecastList export and produces a clean, opinionated cheat sheet of upcoming maintenance events for a single tail, organised so a CAMO can quickly draft a Work Order. Calculator-style, not a black-box optimiser — the tool does the math and flagging; the human keeps the call.

Lives inside Maintenance Tracker for human convenience (same app, consolidated tooling), but otherwise runs standalone — its only shared dependency is **TTAF lookup** from the existing aircraft records.

## Workflow

### Live use
1. CAMO user runs the standard **3M / 100H** forecast in the legacy CAMO system for one tail.
2. CAMO exports it as `.doc`, then **Save As → .docx** in Word.
3. Upload the `.docx` to the forecast module.
4. Tool reads:
   - forecast bounds (date + TTAF) from the doc header,
   - current TTAF from Maintenance Tracker (Settings > Aircraft).
5. Tool renders the cheat sheet on screen. No export, no print — once the WO is issued, the cheat sheet is disposable.

One tail at a time. The CAMO system can't bulk export.

### Training data / glossary build (one-time)
1. CAMO user generates **12M / 500H** forecasts for every tail (wide window to maximise event coverage).
2. Save each as `.docx`. Drop into `forecast_project/training_data/` with tail-number filenames (e.g. `OY-CAH.docx`).
3. A one-time extractor walks every file and produces a review file: every unique event name across the fleet, clustered by best-guess canonical identity, scoped per airframe family.
4. **Interactive consolidation session with the user.** Claude's clustering will handle the obvious matches but ambiguous titles, near-duplicates, and airframe-family edge cases will need SEP's input — this is a real working session, not a rubber-stamp review. Expect to walk the cluster file together, ask questions per ambiguous group, and lock in canonical names interactively.
5. Output: a versioned mapping file (`event_dictionary.json` or similar) shipped with the tool.
6. The runtime parser uses that map. Unmapped names at runtime surface as "needs review" rather than silently dropping.

## Architecture

- **Module location:** inside Maintenance Tracker (separate page/route). Reuses the app's existing UI patterns.
- **Data model:** stateless per upload. The CAMO system remains the source of truth for events. The forecast module does **not** persist events into Firestore — it parses each upload fresh.
- **Persistent assets:** the canonical event dictionary (built during glossary phase) and any tail/airframe metadata already in Maintenance Tracker.
- **Shared with Maintenance Tracker:** TTAF lookup and aircraft metadata only. TTAF stays in the existing integer-minutes convention; tolerances and remaining-hours calculations operate in minutes and display as `H:MM`.

## Parser behaviour

- **Always parses every event in the upload**, regardless of where it falls relative to the user's display window. The full set is available; the UI controls visibility.
- Pulls per-event fields:
  - Name (raw + canonical via dictionary)
  - Section (Inspections / Components / Tasks / ADs)
  - Limit (with unit: H or M)
  - Tolerance % (e.g. `+0%`, `+10%`)
  - Last performed (Perf.)
  - Due (date and/or TTAF)
  - Remaining (Rem.)
  - AD type if applicable (initial / recurring / terminating)
- Pulls header fields: forecast date, forecast TTAF, tail number.

## Display logic

Default display window: **3M / 100H**. (Matches the standard live export bounds.) Events outside this window are parsed but not shown by default — adjustable via UI control if the user wants to peek further out.

Grouping order:
1. **Inspections** (highest priority)
2. **ADs**
3. **Components**
4. **Tasks**


Per-event row shows: name (canonical), due (date + TTAF), tolerance, remaining, **binding axis** (H or M — whichever runs out first), and AD type where applicable.

### Calculation rules

- **Effective due** = stated due extended by `limit × tolerance%`. Items inside the bounds but inside their tolerance get a different visual flag from items hard-due.
- **Cat practice ("50 hour inspection cat practice")**: always included on any scheduled WO. Auto-added to the cheat sheet if any inspection is in window.
- **50 HR piggyback**: if any larger inspection (100 HR, 200 HR, annual, …) falls in window, the 50 HR is auto-included alongside it. Conservative assumption — revisit if real-world cases prove otherwise.
- **Bundling alignment**: when a Component / Task / AD has due time and last-performed matching a scheduled inspection, **flag** for bundling. Do not auto-bundle. Human decides.
- **Out of phase**: a life-limited item (own tach, e.g. governor) whose remaining hours are *less than* the gap to the next scheduled WO. Flag with the gap delta visible — e.g. "governor: 10 H left; next 100 HR: 45 H out — 35 H sacrifice if consolidated." This is the moment the CAMO has to make a judgment call.
- **AD types**: include initial + recurring + terminating; surface the type column so the user can see at a glance.

## UI

Match existing Maintenance Tracker visual language: dense pill/card layout, severity tinting. Severity tiers (working draft):

- **Hard due in window** — strongest tint
- **In tolerance** — softened tint
- **Bundling-aligned** — neutral with a "bundle?" affordance
- **Out of phase** — distinctive flag (yellow/amber suggestion) with delta visible

No print/export. Screen-only cheat sheet.

## Open items (defer to implementation phase)

- Exact severity colour assignments — settle once first prototype is on screen.
- Display-window UI control: slider vs. text inputs vs. preset toggles (3M/100H, 6M/250H, 12M/500H).
- "Needs review" affordance for unmapped event names at runtime — do we block, warn, or silently include with raw name?
- Whether the upload is per-session or persisted to Firestore for audit (probably not, since CAMO is the source of truth — confirm).

## Decisions explicitly **not** taken (and why)

- **No native event model in Maintenance Tracker.** Events live in CAMO; duplicating them would be a maintenance nightmare and offers no upside for the CAMO workflow.
- **No fleet-wide forecast view.** CAMO can't bulk-export and the daily workflow is per-tail anyway.
- **No auto-bundling.** Flag and let the human decide. May revisit after real use.
- **No PDF export of the cheat sheet.** Screen view only — once the WO is cut, the cheat sheet is disposable.
- **No `.doc` parser.** `.docx` only. The "Save As" step is one click and gives clean XML.

## Glossary scope

- Airframe families pulled from Settings > Aircraft in Maintenance Tracker (confirmed during implementation).
- Canonical event names scoped per airframe family (events are linked at airframe level, not tail).
- Mapping file is versioned alongside code so changes are reviewable.

## File layout (planned)

```
forecast_project/
  PLAN.md                       # this file
  init.md                       # original brief
  ForecastList-...doc           # original sample
  training_data/                # glossary build inputs
    OY-CAH.docx
    OY-XXX.docx
    ...
  event_dictionary.json         # canonical mapping (built during glossary phase)
```

## Status

- [x] Requirements gathering & alignment
- [x] Master plan written
- [x] Training data extracted by user (12M / 500H .docx per tail)
- [x] Glossary extractor written (`extractor.py`)
- [x] **Interactive consolidation session with user** — completed; 718 canonical clusters across 8 models, 0 needs_review
- [x] Module skeleton in Maintenance Tracker (route `/forecast`, nav entry, file picker, members-only)
- [x] Parser (docx → header → 4 section tables → dictionary lookup → typed rows)
- [x] First end-to-end UI render (grouped table; no severity tinting yet)
- [ ] Visual sanity check by SEP in browser (pending — server was up at `localhost:5173/forecast` but session ended before review)
- [ ] Calculation rules: effective due (limit × tolerance), 50 HR piggyback / Cat-practice auto-include, out-of-phase delta, bundling-aligned flag
- [ ] Severity tinting + display-window control (default 3M/100H, expandable)
- [ ] Real-data validation pass with user

## Where to pick up next session

The runtime parser and the first-cut UI are done. The CAMO upload → cheat-sheet pipeline works end-to-end against every training tail. **Next concrete step: SEP eyeballs the page in a browser to confirm the layout is sensible, then build the calculation rules (task 8) and severity tinting (task 9).**

### What exists now (runtime side)

Files added under `src/forecast/`:

- `docx.ts` — JSZip + native DOMParser primitive. Returns `{ tables, pageHeaderText }` matching python-docx output (gridSpan-duplicated cells, multi-paragraph cells joined with `\n`, nested tables exposed flat).
- `text.ts` — normalization helpers mirroring `extractor.py` (normalize, stripModelVariant, parseAdNumber, detectEngineSide, Danish-month date parsing, stacked-cell hour/month/date parser, tolerance extractor).
- `parseHeader.ts` — extracts tail (from "Projection List | <TAIL>" cell), forecast end date + end TTAF (from "Aircraft Time" subtable), export date (page header).
- `parseSection.ts` — per-section row parsers (Components 9-col / Tasks 10-col / AD's 8-col / Inspections 7-col). Skips the merged section header + column header rows; dedupes adjacent identical cells.
- `dictionary.ts` — loads `forecast_project/event_dictionary.json` (relative import; Vite handles JSON), builds keyed indexes per (model, section). For ADs: indexes both canonical_number and every raw_number after running them through parseAdNumber (so dictionary entries like "SB 93 AIRFRAME GROUP" match runtime's cleaned "SB 93").
- `parseForecast.ts` — orchestrator. Two-phase API: `parseForecastUnresolved(input)` returns header + raw rows so the page can read the tail, look up the aircraft model, then `resolveRows(rawRows, model)` joins the dictionary. `parseForecast(input, { model })` is the single-shot wrapper.
- `types.ts` — `ForecastSection`, `ForecastRow`, `ForecastHeader`, `ForecastParse`.

UI:

- `src/pages/ForecastPage.tsx` — file picker, parsing/error states, header summary card (tail / model / forecast end), 4 grouped sections in display order (Inspections / AD's / Components / Tasks). Each row: canonical name (raw + "needs review" badge if unmapped), engine-side / AD-type chips, due (date · TTAF), tolerance, remaining (H · M), binding axis (H/M).
- `src/App.tsx` — `/forecast` route, members-only (matches Settings).
- `src/components/Layout.tsx` — Forecast nav entry (Telescope icon, viewerVisible: false).

Deps:

- `jszip` (runtime, ~100KB) — docx unzip.
- `@xmldom/xmldom`, `tsx` (devDeps) — let smoke tests run under Node.

### Verification done

All 11 training docs run through `parseForecast` with **0 needs-review across 590 events** (every row resolves to a canonical name). Smoke scripts kept in `forecast_project/` for re-runs:

- `smoke_docx.ts` — primitive only.
- `smoke_parsers.ts` — primitive + header + sections.
- `smoke_full.ts` — full pipeline (takes `<docx-path> <model>` as args).

Run any of them with: `npx tsx /c/sepic/Maintenance\ Tracker/forecast_project/smoke_full.ts /c/sepic/Maintenance\ Tracker/forecast_project/training_data/OY-CAH.docx TB-10`

Two parser bugs were caught and fixed during validation:
1. **Tolerance line bleeding into AD No. cell** — `Tolerance ±0%` was leaking into `adNumberRaw` when the cell stacked it as a second paragraph. Fixed in `parseSection.rowForAds` (extractTolerance applied to both AD No. and Description cells).
2. **Dictionary AD index keyed on un-cleaned raw_numbers** — dictionary stored e.g. `"SB 93 AIRFRAME GROUP"` but runtime cleaned to `"SB 93"`. Fixed by also running `parseAdNumber` over each raw_number when building the index.

### Decisions locked in this session (don't re-ask)

- **Never drop events.** Unmapped raw names render with their raw name + a "needs review" badge — every event must surface, since the goal is overview, not data cleaning.
- **Turboprops out of scope.** OY-CVW (King Air 350), OY-GSA (PC-12), OY-GSB (PC-12/47), OY-TWM (PC-12/47E) are not managed in this app and are not in the dictionary. If someone uploads one anyway, the page renders an amber notice and falls through with raw names — does not crash.
- **Members-only route.** Forecast is a CAMO tool; viewers don't see it.
- **JSZip + native DOMParser**, not mammoth. Schema is fixed and we want cell-positioning preserved.
- **No persistence.** Forecast results live in component state only — CAMO remains source of truth, per master plan.

### Decisions locked in during consolidation (don't re-ask)

- **Models stay separate.** TB-9 ≠ TB-10 ≠ TB-20. P.68 and P.68 Observer are distinct buckets.
- **AD priority over SB.** When the same physical work is recorded under both an OEM SB number and a regulator AD number across tails, canonical_number = the AD; SB number becomes an alias. Currently 5 such merges in P.68 (see `AD_MERGE_RULES` in `extractor.py`).
- **Same action, multiple intervals → smallest interval.** SBs that mandate one inspection procedure across several intervals (e.g. SB 75 R3 on flight control cables) collapse to a single canonical event scheduled at the strictest interval.
- **Multi-engine ADs split per engine.** L/H and R/H stay as separate canonical events.
- **Part S/Ns and trailing engine/carb identifiers are noise** — stripped from canonical titles.
- **Manual canonical-title overrides** for 4 P.68 clusters (in `CANONICAL_TITLE_OVERRIDES` in `extractor.py`).

### Next-session task: SEP eyeballs the page, then calc rules + severity tinting

1. **Visual sanity check first.** Run `npm run dev`, open `http://localhost:5173/forecast`, upload a training docx (e.g. `forecast_project/training_data/OY-CAH.docx`). Confirm the layout is legible and the data looks right at a glance. Adjust column widths / spacing if needed before stacking calc rules on top.
2. **Calculation rules** (task 8 in tracker):
   - Effective due = stated due extended by `limit × tolerance%`. Distinguish "hard due in window" from "in tolerance".
   - 50 HR piggyback: if any inspection ≥ 100 HR is in window, auto-include the 50 HR.
   - Cat practice ("50 hour inspection cat practice"): always included if any inspection is in window.
   - Out of phase: life-limited item whose remaining hours are less than the gap to the next scheduled WO. Show delta visibly ("governor: 10 H left; next 100 HR: 45 H out — 35 H sacrifice if consolidated").
   - Bundling alignment: when a Component / Task / AD shares due time + last-performed with a scheduled inspection, **flag** for bundling. Do not auto-bundle — human decides.
3. **Severity tinting + display window** (task 9):
   - Tints per master plan (hard-due / in-tolerance / bundling-aligned / out-of-phase). Match Maintenance Tracker's existing severity palette.
   - Display window control: default 3M/100H, expandable. Slider vs presets — settle once first prototype is on screen.
4. **Real-data validation pass with user** — confirm against a fresh CAMO export.

### Open items still to settle

- **Display window UI control** — slider vs preset toggles. Defer until first prototype is on screen.
- **Current TTAF from Settings > Aircraft.** The aircraft record is fetched (so `aircraft.totalTimeMinutes` is available), but the page doesn't yet use it for remaining-hours calculations — the doc's own `Rem.` column is rendered as-is. The PLAN says the runtime parser should pull current TTAF from Maintenance Tracker; revisit when implementing calc rules to decide whether we trust the doc's remaining or recompute against fresh TTAF.
