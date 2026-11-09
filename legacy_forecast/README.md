# Legacy ForecastList reader — handoff for a new project

This folder holds the CAMO **ForecastList `.docx` reader** taken out of
Maintenance Tracker. It is meant as the starting point for a separate app. It
was restored from git history: the code from the commit before `48b267c`
(2026-09-18, "Forecasting removed") and the planning material from the commit
before `ef395e9` (2026-08-17). Nothing in Maintenance Tracker imports this
folder.

The UI (`ForecastPage.tsx`) was left out on purpose because the new app will
have a different UI. Only the reading logic, the event dictionary and the
anchor/consolidation rules are kept here.

## Folder map

```
legacy_forecast/
  README.md                 ← this file; read it first
  src/                      ← runtime TypeScript; framework-free apart from jszip
    docx.ts                 .docx → tables + page-header text (JSZip + DOMParser)
    text.ts                 cell-text helpers: Danish dates, "H"/"M" values, tolerance, AD No. cleanup
    parseHeader.ts          tail, export date, forecast end date + TTAF
    parseSection.ts         the four section tables → raw rows
    dictionary.ts           loads event_dictionary.json, looks up canonical names per model
    event_dictionary.json   locked glossary: 718 canonical events across 8 models (v1, 2026-05-05)
    parseForecast.ts        orchestrator: parseForecastUnresolved → resolveRows
    consolidation.ts        anchor + gap + band logic (see "Anchor points" below)
    types.ts                all public types
  planning/
    init.md                 SEP's original brief: how the forecast is read by hand
    PLAN.md                 master plan + locked decisions from the build (source of truth at the time)
    cluster_review.md       human-readable version of the glossary, per model
  tools/
    extractor.py            one-off Python glossary builder (python-docx); has the tail→model map
    smoke/*.ts              Node smoke tests (npx tsx …); imports already repointed to ../../src
  training_data/
    OY-*.docx               16 fleet exports (12M / 500H), used to build the glossary
    ForecastList-C955F…docx the fresh 2026-10 export from the legacy ERP (OY-CAH)
```

## The document format

The CAMO system exports `.doc`, which is saved as `.docx` in Word. Only `.docx`
is supported; `.doc` was ruled out on purpose. The document consists of Word
tables, and `docx.ts` reads it the way python-docx does:

- **gridSpan cells are duplicated**, so column indexes line up with the table
  grid. Merged header rows therefore show up as N identical cells.
  `parseSection.dataRows` removes adjacent duplicates again.
- A cell's paragraphs are joined with `\n`. Many cells **stack two values**,
  for example an hours line above a date line, so the line breaks matter.
- Nested tables are exposed flat, alongside the top-level tables.

**Header**
- Tail: a cell reading `Projection List\n<TAIL>`.
- Export date: the page header (`word/header*.xml`), e.g. `maj 5, 2026`.
- Forecast bounds: the `Aircraft Time` subtable, with rows labelled `Date` and `TTAF`.

**Sections:** a table is found when the first cell of row 0 equals the
section name. Row 0 is the section title and row 1 is the column header; data
starts at row 2.

| Section | Columns (index order) |
|---|---|
| Components | Reg., Components/Action, Serial No., Limit, Perf., TTSC, TTSN, Due, Remaining |
| Tasks | Reg., Task #, Task, ATA Code, Action, Limit, Perf., TTSC, Due, Rem. |
| AD's | Reg., AD No., Description, Type, Perf., TTSC, Due, Rem. |
| Inspections | Reg., Name, Limit, Perf., TTSC, Due, Rem. |

**Cell value formats** (see `text.ts`)
- Hours: `13594.80H`, or a negative `-171.90H`. The Aircraft Time table uses `14 158.2` with no H.
- Months: `144.00M`, or a negative `-5.77M`.
- Dates use **Danish month abbreviations**: `maj 5, 2026`, `okt 3,2027`.
- `Tolerance ±N%` is often a trailing paragraph in the name cell, and on AD's
  sometimes in the AD No. cell. It has to be stripped before any lookup.
  Encoding damage (`­`, `ï¿½`) appears in place of `±`.
- AD No. cells carry qualifiers that are not part of the number:
  `FAA 2026-04-11 | Engine`, `RAI AD 1991-125 AIRFRAME GROUP`, `… LH Engine`.
  `parseAdNumber` removes them and keeps the L/H or R/H side.
- Components carry the action inside the name (`Engine mount / Ret`). Tasks
  have a separate Action column (`Ins`, `Cal`, `Rep`, `Ove`, `Ret`, …).

**The `Rem.` column is deliberately not used.** It is calculated from whatever
TTAF and date the CAMO system had when the document was printed, so it is out
of date by the time anyone reads it. Remaining time is always worked out from
**Due** against the live TTAF and today's date.

A quick check on 2026-10-26 found that the fresh export
(`training_data/ForecastList-C955F…docx`) still has the same landmarks:
`Projection List OY-CAH`, `Aircraft Time`, and the four section tables. A full
run of the parser against it has **not** been done yet. That is the first
thing to do in the new project.

## Event dictionary (glossary)

The legacy data was typed in by many different people, so the same event has
different names on different tails. `event_dictionary.json` maps every raw
variant to one canonical name **per aircraft model**. The models are
deliberately kept apart: TB-9, TB-10 and TB-20 are separate, and so are P.68
and P.68 Observer. Because the dictionary works by model, the tail→model map
(`MODEL_BY_TAIL` in `tools/extractor.py`) is needed to resolve a file.

Lookup keys:
- **Inspections / Components / Tasks:** `normalize(stripModelVariant(name))`,
  i.e. lowercase, letters and digits only, P68B/P68C suffixes removed.
- **AD's:** cleaned AD number + engine side, with a no-side fallback.

Rules locked in with SEP during the glossary session:
- **An AD outranks an SB.** When the same work appears under an SB number and
  an AD number, the AD is the canonical record and the SB becomes an alias.
- When one action has several intervals, the **smallest interval** wins.
- Multi-engine ADs are **split into L/H and R/H**.
- Part serial numbers and trailing engine/carburettor identifiers are noise and are stripped.
- **Never drop an event.** A row not found in the dictionary keeps its raw
  name and is marked `needsReview`.

The dictionary was validated in 2026-05 with 0 needs-review across 590 events
in 11 training files. Changes to the old ERP data since then may add new
variants.

## Anchor points

The anchor is a cross-check: any row it flags should look like a scheduled
inspection. Two definitions exist, and the newer one is the current thinking.

### 1. Legacy forecast definition (2026-05, in `consolidation.ts`)

**The anchor is the next 50 hr inspection**, meaning the Inspections row whose
canonical name matches `50 hr(s)/hour(s) … insp(ection)`. Lubrication rows are
excluded; cat-practice rows are allowed because some models fold the two into
one entry. If several rows match, the one with the soonest due TTAF wins, then
the soonest due date.

- `anchorTtaf` = that row's Due hours. `anchorDate` = its Due date.
- **50+100 visit:** if a 100 hr inspection is due within ±5 h of the anchor,
  it is the same visit. The cadence is 50, 50/100, 50, 50/100, … and both
  inspections have to go on the WO, because the 100 hr does not add the 50 hr
  automatically.
- **"50 hour inspection cat practice"** (CAT's own Part-145 AMP practice)
  always comes along on every 50 hr visit, whatever its band.
- The anchor row itself is fixed at gap 0, green, "at anchor". It is never put
  through the gap calculation, because some records carry a calendar deadline
  that is years out of date next to a current TTAF.

**Rule #1: deadlines are never exceeded.** Items may only be pulled earlier,
never pushed later.

Each item gets a `gap = item deadline − anchor`, in hours (+ means due after
the anchor). The gap places it in one of four bands:

| Band | Gap | Meaning |
|---|---|---|
| green | ≤ ±5 h | clean fit, goes on the draft WO |
| amber | ≤ ±10 h | on the WO, labelled "premature by X h" |
| forced but awkward | beyond ±10 h, gap < +50 h (or any negative gap) | must be done this cycle but fits badly; SEP decides |
| defer | gap ≥ +50 h | next 50 hr cycle (exactly +50 h defers, since most items fall on 50 h multiples) |

The direction tells what has to move:
- positive gap → **the item is pulled forward** into the visit.
- negative gap within amber → **the visit moves earlier**.
- negative gap beyond amber → **needs its own earlier visit**.

A lead-time side list shows Ret/Ove (retire/overhaul) items within 100 h or
3 months so swap units can be ordered in time.

### 2. Newer definition (2026-09, Next Due module, still live in Maintenance Tracker)

From `src/compliance/nextDue.ts`. Anchors are **all scheduled inspections**,
not just the 50 hr. The test is a match on the **whole description**:

```ts
const ANCHOR =
  /^(?:\d[\d.,]*\s*(?:hours?|hrs?|h|fh)\s+(?:major\s+)?inspection|annual\s+inspection|major\s+inspection)\.?$/i;
// matched against description.trim().replace(/\s+/g, " ")
```

This matches "50 hour inspection.", "100 hour inspection.", "Annual
inspection." and "2000 hour major inspection.". Component tasks that only
*mention* an interval, such as "Alternator 100 hour inspection." or "Annual
inspection of ELT.", are deliberately **not** anchors. That regex was written
for the compliance-report wording, so it will need adjusting for the
ForecastList canonical names (e.g. `50 hrs Inspection`, `1000 Hrs/ annual insp`;
see `planning/cluster_review.md`).

### ⚠ Superseded assumption: utilisation rate

The legacy engine converted calendar deadlines into hours with a **utilisation
rate** (default 25 FH/month, `gapEstimated: true`). **SEP has since rejected
this** (2026-09-28). Utilisation depends on weather and on where students are
in their training, so it cannot be estimated. Hours bring an aircraft in about
9.9 times out of 10.

For the new app:
- Never guess FH/month to compare the hours and calendar axes.
- Hours limits come first; calendar is the fallback.
- An item that is already overdue decides its own placement.

The code in `consolidation.ts` that does this conversion (`computeGap`,
`DEFAULT_UTILIZATION_HOURS_PER_MONTH`) should be removed or replaced.

## Inputs the new app will need from elsewhere

- **Live TTAF** per tail. Maintenance Tracker gets it from Flightlogger and
  stores it as integer minutes; TTAF
  never goes down.
- **Tail → model** map (see `tools/extractor.py`).
- Turboprops (PC-12, King Air) were out of scope: they are not in the
  dictionary and appear with raw names only.

## Getting it running in a new project

- Runtime dependency: `jszip`. For the Node smoke tests: `@xmldom/xmldom` and `tsx`.
- `docx.ts` uses the global `DOMParser`. That works in a browser; under Node,
  the smoke tests install `@xmldom/xmldom` as a global first (see their
  headers).
- `dictionary.ts` imports the JSON directly, which needs `resolveJsonModule`
  (or a bundler such as Vite).
- Suggested first step:
  `npx tsx tools/smoke/smoke_full.ts training_data/ForecastList-C955F….docx TB-10`
  (OY-CAH is a TB-10). Then compare the output with the document.
- The usage comments at the top of the smoke files still name the old
  `forecast_project/` paths; the imports themselves are fixed.
