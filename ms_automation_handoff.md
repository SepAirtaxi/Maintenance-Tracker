# Maintenance statement automation — handoff

Companion to `ms_automation.md` (SEP's original brief). Written 2026-09-18.

## Status

Parser and picker are **built, typechecked, production-build clean, and
uncommitted**. Never opened in a browser — SEP runs the dev server, so first
job next session is likely a visual check.

New dependency: `pdfjs-dist` ^4.10.38 (installed, in `package.json`).

## What it does

On the **Actual statement** tab, section 02 Next Due:

1. Upload the ERP "Aircraft Status" PDF.
2. Each of the three rows (Hours / Calendar / Cycles) grows a list of
   candidates underneath it, soonest first.
3. Click a row → fills that row's Event and deadline fields. Both stay
   editable. Highlight is derived from the field values, so typing over either
   clears it.
4. Generate, as before.

Nothing is auto-picked and nothing is stored — the report lives in memory for
the session.

## Files

```
src/compliance/
  types.ts                   shapes
  text.ts                    number/date parsing (see "two decimal conventions")
  layout.ts                  PDF text runs → table records
  parseHeader.ts             identity block
  remaining.ts               the Remaining cell + stop-block math  ← read this first
  consolidate.ts             folds duplicate events into one card
  stopBlocks.ts              records → three candidate lists
  pdf.ts                     only file that touches pdfjs (lazy-loaded)
  parseComplianceReport.ts   entry point
src/components/statement/
  ComplianceUpload.tsx       upload bar, tail-mismatch warning, warnings
  CompliancePicker.tsx       one candidate list
src/pages/StatementPage.tsx  wiring (search "Next Due pickers")
```

Samples: `sample/Aircraft Status Report OY{CAT,CDC,CDU}.pdf` — Britten-Norman,
Vulcanair, Daher. Compliance data is messy (mid-ERP-migration); the *layout* is
what they're good for.

## The one thing to understand before changing anything

**Stop-blocks come from the Remaining column, not Compliance Due.**

Compliance Due is not a single axis. Events tracked against a component's own
hour meter print that component's figure in the same column as airframe ones,
unmarked — OY-CAT shows a vacuum pump at `71,70h` against an airframe at
`13.709,45h`. 57% of that aircraft's hour limits are component-based, 38% on
OY-CDC, 0% on the single-engine OY-CDU. Sorting Compliance Due directly puts
engine overhauls above the next 50 hour inspection.

Remaining is a *distance*, so it is axis-free. Anchored to the report's own
Total Hours (never live TTAF — that's what makes it stale-proof):

    stop-block = report Total Hours ± Remaining

Verified: reproduces the printed Compliance Due exactly on all 82 airframe-based
rows across the three reports, and reconciles on cycles too (5/5).

Sign is not in the number — the report writes distance as a magnitude and marks
direction with `OVD`, separately per axis.

Calendar deadlines are read straight off Compliance Due; a date has only one
possible meaning, and Remaining carries calendar distance only as rounded months.

## Decisions SEP has already made — don't re-litigate

- **No auto-pick, no priority ranking.** The CAMO picks. Ties being unordered
  is fine; it's a handful of events to eyeball.
- **Tolerances are out of scope.** SEP decides extensions and types over the
  value.
- **Overdue needs no special handling** beyond being visible — in normal
  operation it doesn't happen. It's collapsed at the top of each list.
- **Component vs inspection is irrelevant.** If anything is due, it's due.
- **TTAF/cycles come from Flightlogger, never the PDF.** The report's figures
  are used internally for the conversion above and nowhere else.
- **Turboprops are out of scope for now** (not live in Flightlogger). The parser
  doesn't actually need Flightlogger at all, so this is a UI-level question only.
- **Duplicates are folded** — same kind, same description, same stop-block.
  Descriptions match case- and trailing-punctuation-insensitively, because the
  ERP holds the same event under inconsistent spellings. OY-CAT's eleven life
  vests become one card reading "12 items".

## Gotchas already found and fixed — don't reintroduce

- **Per-page table bounds.** Page 1's header block is taller than the one on
  continuation pages (table starts y≈204 vs y≈148). A fixed cutoff silently ate
  the first ~4 printed lines of every later page — it was dropping 19/16/9
  records per report and still looked plausible. Each page now finds its own
  bounds from the "Frequency" heading and the "AircraftStatus.rpt" footer.
- **Row banding, not sorting by `top`.** pdfjs gives a label and its value
  baselines 0.25pt apart, so a plain sort returns all values then all labels.
- **Cell joining differs by column.** Descriptions and event types join with a
  space; every other column joins tight, or `2.000,00H|36c` + `m` breaks.
- **Records start on the Status column**, not the Event column — Event is blank
  on rows whose description pushed it down.
- **Two decimal conventions on one page.** Hours and cycles are Danish
  (`13.730,90`), the months figure in Remaining is English (`58.58month`), and
  the header figures are English-grouped (`13,709.45`).
- **`*** End of Document ***`** lands in the Status column and would otherwise
  open a record.
- **Footer "Ref. NN"** sits at x≈754, inside the Compliance Due band.
- **pdfjs is lazy-loaded.** Importing it statically put ~380 kB in the main
  bundle for a feature used on one tab.

## Verification done

- 345 records across three reports: all event types and statuses valid, no empty
  descriptions, no merged rows, every Remaining cell fully consumed by the
  grammar (the check I'd trust most).
- 273 click round-trips simulated: the value written into a field survives into
  the PDF and the row re-highlights. 0 failures.
- Node harness lives in the session scratchpad and is gone. To rebuild: extract
  text runs with pdfjs in Node (same transform maths as `pdf.ts`), dump to JSON,
  compile `src/compliance/*.ts` minus `pdf.ts`, feed it in. The logic is
  deliberately split so it runs without a PDF engine.

## Open / next

- Visual pass in the browser. Nothing has been seen rendered.
- Six rows show before "show more" — may want tuning once it's on screen.
- More sample reports would widen coverage; column grid is identical across the
  three we have, but all three are pistons.
