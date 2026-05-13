# Forecast Module — Master Plan

Consolidated from planning sessions. This is the source of truth; if a future session contradicts it, trust this doc unless explicitly updated.

## Goal

A **decoder and consolidation organiser** for the CAMO ForecastList export — not a forecaster. The docx already holds the predictions; this module's job is to surface, organise, and consolidate them against the live aircraft state so a CAMO can quickly draft a Work Order for the next scheduled visit. Calculator-style, not a black-box optimiser — the tool does the math and flagging; the human keeps the call.

Lives inside Maintenance Tracker for human convenience (same app, consolidated tooling), but otherwise runs standalone — its only shared dependency is **TTAF lookup** from the existing aircraft records.

## Workflow

### Live use
1. CAMO user runs the standard **3M / 100H** forecast in the legacy CAMO system for one tail.
2. CAMO exports it as `.doc`, then **Save As → .docx** in Word.
3. Upload the `.docx` to the forecast module.
4. Tool reads:
   - forecast bounds (date + TTAF) from the doc header,
   - per-row due-dates and due-TTAFs from the docx (the **"Remaining" column is ignored** — it's stale by upload time, derived from whatever TTAF/date the CAMO system had when the doc was generated),
   - current TTAF from Maintenance Tracker (Settings > Aircraft) — the live truth,
   - today's date (= upload date).
5. Tool runs the consolidation model (see below) and renders the cheat sheet on screen. No export, no print — once the WO is issued, the cheat sheet is disposable.

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

## Consolidation model

The engine that turns parsed forecast rows into a proposed Work Order. Locked in during the design conversation on 2026-05-13.

### Rule #1 — deadlines are never exceeded
Every due-date and due-TTAF in the forecast is a hard ceiling. The module may only propose performing items **early** — never late. This drives every other rule below.

### Inputs

- Parsed docx (one tail).
- **Current TTAF** from Maintenance Tracker (`aircraft.totalTimeMinutes`) — live, not the docx's snapshot.
- **Today's date** (= docx upload date).
- Configurable tolerances. Defaults: **±5 h green**, **±10 h amber**. Same values for 50 hr and 100 hr visits (the cadence is strict 50 h either way — see anchor section).
- Utilization rate (h/month) for calendar→hour conversion. Per-aircraft override or estimated from recent flight history; ±1 h / ±1 day precision is plenty.

The docx's "Remaining" column is **not used** anywhere — every "hours from now" / "days from now" figure is recomputed against current TTAF and today's date.

### Anchor — the next 50 hr inspection

The anchor is the next scheduled 50 hr inspection. Located via:

- `anchor_TTAF` = the 50 hr row's due-TTAF in the docx
- `anchor_date` = the 50 hr row's due-date in the docx
- `hours_to_anchor` = `anchor_TTAF − current_TTAF`
- `days_to_anchor` = `anchor_date − today`

The 50 hr visit may also be a 100 hr visit (alternating). When it is, the workshop window is wider in practice, but the consolidation tolerances stay the same — per user direction, the wider 100 hr window is a *scope* concern (how much component work fits in the visit), not a tolerance-window concern.

### The cycle window

Every item with a deadline between `anchor` and `anchor + 50 h` MUST be addressed at the upcoming visit — there's no other visit before the deadline runs out, given the strict 50 h cadence. This is the direct consequence of Rule #1.

Within that cycle window, items are **labeled** — not gated — by the four bands below.

### The four bands

For each forecast item, compute `gap = item_deadline − anchor` (positive = item is due after the anchor, negative = item is due before). Calendar items get converted to hours via the utilization rate and tagged `estimated`.

| Band | Gap to anchor | Behaviour |
|---|---|---|
| **Green** | within ±5 h | Auto-include in draft WO. Clean consolidation. |
| **Amber** | within ±10 h (and outside green) | Include in draft WO, labeled `premature by X h` so it's visible at a glance. |
| **Forced but awkward** | beyond ±10 h, still inside `anchor + 50 h` | MUST be addressed (Rule #1) but too far from the anchor to be a clean fit. Flag separately — the user may want a different visit scope (e.g. workshop time for a propeller overhaul) instead of cramming it into a 50 hr pit-stop. |
| **Defer** | beyond `anchor + 50 h` | Wait for the next 50 hr cycle. Available in an expanded view if the user wants to peek further. |

### Direction matters

Items with **positive** gap (deadline after anchor) → labeled `item pulls forward by X h`. The visit happens on schedule; the item is brought forward into it.

Items with **negative** gap (deadline before anchor) → labeled `anchor moves earlier by X h`. The visit itself has to shift forward to honour Rule #1. More disruptive than pulling an item forward, so this direction should be visually distinct in the output.

Beyond the negative amber band, the item can't be absorbed by shifting the anchor — it needs its own earlier visit. Flag that explicitly.

### Calendar → hour conversion

For date-based deadlines (annual inspections, calendar-deadline ADs): convert to estimated hours-from-now using the utilization rate. Tag every converted item as `estimated` so the user knows the band placement has slop. When in doubt, **err on the side of "due sooner"** so Rule #1 is never breached by overestimating remaining hours.

### Outputs

- **Anchor visit summary**: due-TTAF, due-date, whether it's 50-only or 50+100.
- **Draft WO**: greens + ambers, in existing grouping order (Inspections / ADs / Components / Tasks). Each row shows the band, direction, and gap.
- **Flagged for review** (separate panel): forced-but-awkward items with their gap to the anchor and a short explanation of why they need a human decision.
- **Out-of-cycle preview** (optional / expandable): defer-band items so the CAMO can peek at the next cycle.

### Auto-includes that bypass band logic

- **Cat practice ("50 hour inspection cat practice")** — always included on any 50 hr visit, regardless of where it sits in the forecast.

## Display logic

Default display window: **3M / 100H**. (Matches the standard live export bounds.) Events outside this window are parsed but not shown by default — adjustable via UI control if the user wants to peek further out.

Grouping order:
1. **Inspections** (highest priority)
2. **ADs**
3. **Components**
4. **Tasks**


Per-event row shows: name (canonical), due (date + TTAF), tolerance, remaining, **binding axis** (H or M — whichever runs out first), and AD type where applicable.

### Calculation rules

See **Consolidation model** above for the full engine (Rule #1, anchor, cycle window, four bands, direction handling, calendar→hour conversion). Notes specific to display:

- **Effective due** = stated due. Tolerance % from the docx is informational only — the consolidation model uses the *hard* due date/TTAF as the ceiling per Rule #1, then expresses prematurity in absolute hours via the ±5 h / ±10 h bands. (We don't extend the deadline by `limit × tolerance%`; the docx's tolerance % is shown alongside the row but doesn't drive band placement.)
- **Cat practice** auto-included on every visit (see Consolidation model).
- **50 HR piggyback** is now implicit: the anchor is always the next 50 hr visit, and a 100 hr visit (when one is due) coincides with a 50 hr by definition of the alternating cadence.
- **Bundling alignment** → folded into green/amber bands.
- **Out of phase** → now the explicit "forced but awkward" band, with the same delta-visible flag (e.g. "governor: 10 h left; anchor at +15 h — 25 h sacrifice if consolidated; consider earlier visit").
- **AD types**: include initial + recurring + terminating; surface the type column so the user can see at a glance.

## UI

Match existing Maintenance Tracker visual language: dense pill/card layout, severity tinting. Severity tiers map 1:1 to the consolidation model's four bands:

- **Green** — clean consolidation (≤ ±5 h from anchor). Neutral / positive tint.
- **Amber** — premature by 5–10 h. Softer warning tint; row shows `premature by X h`.
- **Forced but awkward** — beyond ±10 h but inside the cycle window. Distinctive flag (red/strong amber) with the gap delta visible.
- **Defer** — out of cycle. Muted / hidden by default; expandable.

Direction badges (`pulls forward by X h` / `anchor moves earlier by X h`) sit on each non-defer row so the user can tell pull-forward from anchor-shift at a glance.

No print/export. Screen-only cheat sheet.

## Open items (defer to implementation phase)

See "Open items still to settle" near the end of the doc for the current live list. Items resolved since this section was written:

- **"Needs review" affordance** → resolved: never drop events; render raw name with badge.
- **Persistence** → resolved: no Firestore persistence, per-session only.
- **Severity colours** and **display-window control** → still open, see end of doc.

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
- [x] **Consolidation model agreed with user** (2026-05-13) — Rule #1, anchor = next 50 hr, cycle window, four bands (green/amber/forced-but-awkward/defer), direction labels, calendar→hour conversion. See **Consolidation model** section above.
- [x] **Implement consolidation model** (2026-05-13) — anchor detection, gap calc, four-band assignment, direction labels, calendar→hour conversion via utilization rate. Lives in `src/forecast/consolidation.ts` (pure module).
- [x] Wire current TTAF (`aircraft.totalTimeMinutes`) and today's date into the calc; the docx's "Remaining" column is no longer rendered.
- [x] Severity tinting (four bands) — emerald / amber / rose / neutral per the four bands. Implemented in `src/pages/ForecastPage.tsx`.
- [x] Per-aircraft utilization rate field on `Aircraft` (`utilizationHoursPerMonth?: number | null`) — type + create-path init done; default constant 25 h/month when null.
- [ ] **Visual sanity check by SEP in browser** — engine + UI passed typecheck + production build; smoke tests show clean band distribution on OY-CAH (TB-10), OY-CAC (P.68), OY-BUF (C172M), OY-CDB (TB-20). Awaiting user eyeball.
- [ ] Tolerance + utilization config surface — defaults baked in; per-aircraft util override field exists on `Aircraft` but no Settings UI to edit it yet.
- [ ] Display-window control (default 3M/100H, expandable) — deferred per "Open items"; the four bands + next-cycle preview may already cover the use case.
- [ ] Real-data validation pass with user

## Where to pick up next session

Consolidation engine + UI re-skin are done (session of 2026-05-13). The page renders an anchor card, draft WO, flagged-for-review, and a collapsible next-cycle preview, with four-band tints and direction badges on every non-anchor row. **Next concrete step: visual sanity check by SEP in the browser**, then a real-data validation pass against a fresh CAMO export. After that the open items (utilization editor in Settings, display-window control if it's still wanted) can be addressed.

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

### Consolidation model — implemented 2026-05-13

The engine + UI panels described in the **Consolidation model** and **UI**
sections at the top of this doc are now in code:

- `src/forecast/consolidation.ts` — pure module. Anchor detection (50 hr
  inspection row, lubrication excluded), gap calc (binding axis = min of
  hour-gap and calendar-converted gap), band assignment, direction labels,
  cat-practice auto-include, warnings for missing anchor / missing TTAF.
  Defaults: 5 h green, 10 h amber, 50 h cycle, 25 h/month utilization.
- `src/forecast/types.ts` — `ForecastBand`, `ForecastDirection`,
  `ForecastConsolidationRow`, `ForecastAnchor`, `ForecastConsolidation`.
- `src/pages/ForecastPage.tsx` — anchor card, draft WO panel (grouped
  Inspections / ADs / Components / Tasks, band-tinted), flagged-for-review
  panel, collapsible next-cycle preview, unclassified fallback.
- `src/types.ts` — `Aircraft.utilizationHoursPerMonth?: number | null` field
  (init `null` on create; default constant applied at consolidation time).
- `forecast_project/smoke_consolidation.ts` — Node-runnable smoke. Pass a
  training docx + model; defaults the synthetic current TTAF to anchor−5 h
  so the upcoming visit lands in green for a realistic scenario.

Two bugs caught + fixed during smoke:

1. **Anchor row picked up a stale calendar gap.** Some CAMO records carry a
   years-old date deadline alongside a current TTAF on the 50 hr line; the
   min-gap rule mislabeled the anchor as `needs_earlier_visit` from the
   date axis. Fixed by hard-coding the anchor's gap to 0 / `at_anchor` /
   `green` and never running it through `computeGap`.
2. **Items at exactly `gap = 50` were flagged forced-awkward.** Most
   recurring 100/200/500 hr items land on exact 50-multiples; the plan's
   "still inside `anchor + 50 h`" reads as strict, so the boundary now
   defers. Caught on OY-BUF (14 false-flags → defer).

### Next-session task: real-data validation

1. **Browser eyeball.** Run `npm run dev`, upload a fresh CAMO export, and
   sanity-check anchor placement, band assignments, and the flagged-for-
   review panel against operational judgment.
2. **Tweak tolerances if the green/amber bands feel wrong** — they're
   constants in `consolidation.ts` (`DEFAULT_GREEN_HOURS`, `DEFAULT_AMBER_HOURS`).
3. **Per-aircraft utilization editor** — the field exists on `Aircraft`
   but Settings → Aircraft has no input for it yet. Add one if/when the
   default 25 h/month feels too coarse.
4. **Display-window control** — open question whether it's needed at all
   given the four bands + next-cycle preview. Defer until user has lived
   with the page.

### Open items still to settle

- **Configurable tolerances UI.** Tolerances (±5 h / ±10 h) start as constants in code. Decide later whether to expose per-aircraft or per-airframe overrides — probably overkill for v1.
- **Utilization rate source.** First pass: per-aircraft override field on `Aircraft`, default constant when unset. Second pass (maybe): auto-estimate from recent flight history (`MaintenanceEvent` TTAF deltas over the last N months). Don't build the estimator until v1 is on screen and the user has lived with it.
- **Display window UI control** — defer until v1 is on screen. The four bands plus "next cycle preview" may already cover the use case without a window slider.
- **Severity colour palette** — settle once the four-band layout is on screen. Match existing Maintenance Tracker tints.
