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
- [ ] Module skeleton in Maintenance Tracker
- [ ] Parser
- [ ] Display logic + UI
- [ ] Real-data validation pass with user

## Where to pick up next session

The glossary phase is complete. Next concrete step: **build the runtime parser** that consumes a single uploaded `.docx` ForecastList and produces the cheat-sheet rows.

### What exists now

- `forecast_project/extractor.py` — glossary builder. Re-runnable; rebuilds `event_dictionary.json` and `cluster_review.md` from `training_data/*.docx`. Owns all canonicalization rules (model scoping, AD-merge map, title overrides, part-identifier stripping, interval collapse).
- `forecast_project/event_dictionary.json` — the canonical mapping. **This is the file the runtime parser will consume.** 8 models × 4 sections (Inspections / AD's / Components / Tasks) = 718 entries. Each entry has the canonical form plus the raw variants it accepts.
- `forecast_project/cluster_review.md` — human-readable view of the same data; useful for spot-checking but not consumed at runtime.
- `forecast_project/training_data/` — full docx training set + reference SBs (SB75 REV3.pdf, SB113Eng.pdf) read during consolidation.

### Decisions locked in during consolidation (don't re-ask)

- **Models stay separate.** TB-9 ≠ TB-10 ≠ TB-20. P.68 and P.68 Observer are distinct buckets.
- **AD priority over SB.** When the same physical work is recorded under both an OEM SB number and a regulator AD number across tails, canonical_number = the AD; SB number becomes an alias. Currently 5 such merges in P.68 (see `AD_MERGE_RULES` in `extractor.py`).
- **Same action, multiple intervals → smallest interval.** SBs that mandate one inspection procedure across several intervals (e.g. SB 75 R3 on flight control cables) collapse to a single canonical event scheduled at the strictest interval.
- **Multi-engine ADs split per engine.** L/H and R/H stay as separate canonical events.
- **Part S/Ns and trailing engine/carb identifiers are noise** — stripped from canonical titles.
- **Manual canonical-title overrides** for 4 P.68 clusters (in `CANONICAL_TITLE_OVERRIDES` in `extractor.py`).

### Next-session task: runtime parser

The parser lives in the Maintenance Tracker app (TS, in `src/`). It needs to:

1. Accept a single `.docx` upload (the live 3M/100H forecast).
2. Parse the same 4 section tables (Components, Tasks, AD's, Inspections) — same column schemas as the training data.
3. Pull header bounds: forecast date, forecast TTAF, tail number.
4. For each row, look up `event_dictionary.json` to get the canonical name (and AD canonical number/title/side for AD rows).
5. Surface unmapped raw names as "needs review" rather than silently dropping (per `Open items` in this plan).
6. Pull current TTAF from Maintenance Tracker (Settings > Aircraft).
7. Emit structured per-event rows ready for the UI: name (canonical), due (date+TTAF), tolerance, remaining, binding axis, AD type.

The Python extractor's parsing logic in `extractor.py` (`section_data_rows`, `cluster_key_and_payload`) is a good reference for column ordering / table structure — port the schema knowledge to TS.

### Open items still to settle

- **"Needs review" affordance at runtime.** When the parser sees a raw name not in the dictionary, do we block, warn, or silently include with raw name? Decide before the parser ships.
- **Unmapped tails.** OY-GSA / OY-GSB / OY-TWM / OY-CVW are in the fleet but not in the training set (different category). The runtime needs to either reject their uploads gracefully or be extended to cover them. Decide before public release.
- **Display window UI control** — slider vs preset toggles. Defer until first prototype is on screen.
