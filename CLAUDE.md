# Project guidance for Claude

## Design system (design-exp branch)

The app uses a custom design system called **"Hangar / Aviation-precision Modernism"** — Swiss-modernist editorial language applied to aviation maintenance tooling. The system was introduced in a complete visual overhaul on 2026-05-21 and merged to `main` the same day (deployed live on Vercel).

### Hard rules — do not violate

- **Zero border-radius** everywhere except severity dots / circular avatars (`rounded-full` still works). The Tailwind radius scale (`sm`/`md`/`lg`/`xl` etc.) is overridden to `0` in `tailwind.config.js`.
- **Hairline borders, not shadows.** Use `border border-foreground/15` (or /10/20/25 etc.) instead of `shadow-sm`. The only intentional elevation is `shadow-dialog` for modal content.
- **Severity colors come from `sev-*` tokens.** Never use `bg-emerald-50`, `bg-rose-100`, `text-amber-900`, `border-sky-300` etc. — use `bg-sev-green-bg`, `text-sev-red-fg`, `border-sev-yellow-edge`, etc.
- **Typography:** `font-display` (Bricolage Grotesque) for h1's and section labels, `font-sans` (Inter Tight, the default) for UI body, `font-mono` (JetBrains Mono) for tail numbers, dates, TTAF, hours-left, any number that should read like an instrument readout.
- **Small-caps eyebrows:** `.label-eyebrow` / `.label-eyebrow-strong` for zone labels; or inline `text-[10px] font-bold uppercase tracking-spec` (= 0.14em letterspacing).

### Tokens

All design tokens live in `src/index.css` as CSS variables under `:root`, and are exposed to Tailwind via `tailwind.config.js`. Base palette tokens: `--background --foreground --card --primary --secondary --muted --accent --destructive --border`. Severity tokens follow `--sev-{red|yellow|green}-{fg|bg|edge}`. Change palette by editing those tokens — do not hardcode hex/HSL elsewhere.

### AircraftCard structure

The card on this branch is three deliberate zones — masthead, conditional alerts, ledger. **Don't bolt on new top-level horizontal strips**; extend an existing zone.

1. **Masthead** — 160px tail-stamp left rail (full masthead height) + right region with identity row (model/badges/actions/last-updated), TTAF instrument strip, BOOKINGS instrument strip. Strip-label cells and tail-stamp must stay the same width (160px) for vertical alignment.
2. **Alerts** (conditional) — grounding banner, note banner. Same shape: severity left-rail + small-caps kicker + content + optional click-through arrow.
3. **Ledger** — events + defects in one block, separated by `EVENTS · N ACTIVE` / `DEFECTS · N OPEN` small-caps zone labels. Columns share `EVENTS_GRID_COLS`. Due-at and Time-left are flat hairline-divided cells, not nested mini-grids.

### Gotcha: small-caps pill widths

Pills using `tracking-spec` (0.14em letterspacing) are wider than a naive char-count suggests. A small-caps "NOT ESTIMATED" pill with icon at 10px is ~160px wide. When sizing grid columns that hold such pills, measure: `chars × ~8.5px + (chars-1) × 1.4px + 2×padding + icon-width + border`.

## Flightlogger TTAF sync (shipped 2026-05-26)

TTAF for piston aircraft is auto-pulled from the Flightlogger GraphQL API; the old CSV import flow (`ImportDialog`, `services/import.ts`, `lib/csv.ts`, `papaparse`) was deleted in the same change.

### Architecture

- **`api/flightlogger-sync.ts`** — Vercel Edge serverless function. Reads `FLIGHTLOGGER_TOKEN` from `process.env` (set as a Vercel env var). Runs a fixed GraphQL query (`aircraft { callSign, totalAirborneMinutes }`) and returns the result as JSON. The token never reaches the browser; the proxy can only ever return TTAF data because the query is hardcoded.
- **`src/services/flightlogger.ts`** — browser-side sync. Fetches the proxy, maps `callSign → tailNumber` (uppercased/trimmed), applies the monotonic-increase rule (won't decrease stored TTAF), batch-writes per-aircraft TTAF + audit entries + the `meta/flightloggerSync` summary doc.
- **`tsconfig.api.json`** — typechecks the `api/` folder. Referenced from the root `tsconfig.json`.

### Sync triggers

- **Auto on app load**, gated by Europe/Copenhagen calendar day. First load of a new CPH date triggers a sync; subsequent loads same day are no-ops.
- **Manual "Sync TTAF from Flightlogger" button** on the OverviewPage header — always available, not gated.

### Indicators

- **Global filing-strip indicator** in `Layout.tsx` — shows `TTAF SYNCED DD.MM.YYYY HH:mm` on every page. Red-dot failed state with hover-detail on `meta.lastError`. Falls back to "TTAF · not yet synced" on permission/network errors so the indicator never silently disappears.
- **OverviewPage SyncIndicator** — detailed inline view with the full summary string ("5 updated, 1 unchanged, 2 stale (OY-CMC, OY-XYZ), 2 excluded").
- **Per-aircraft audit log** entries are written for each TTAF change with source `flightlogger`.

### Per-aircraft opt-out

`Aircraft.syncTtafFromFlightlogger?: boolean`. Treat **absent/undefined as `true`** (the default — sync is on). Only an explicit `false` excludes a tail. Managed via Settings → Flightlogger sync tab. Turboprops (PC-12, King Air) are the typical exclusion target — their TTAF is maintained in CAMO's separate system, not Flightlogger.

### Sync result categories

- **Updated** — Flightlogger value > stored, we wrote the new value.
- **Unchanged** — Flightlogger value === stored, no write.
- **Stale (skipped)** — Flightlogger value < stored. Monotonic rule blocks the write; safe behavior for the "deleted flight in Flightlogger" edge case. Tails are inlined in the summary.
- **Excluded** — `syncTtafFromFlightlogger === false`. Skipped silently per-aircraft, counted in the summary.
- Call signs that Flightlogger reports but aren't in our fleet are silently dropped (no category).

### Token + secrets

- Token lives in Vercel env var `FLIGHTLOGGER_TOKEN`. Never put it in `.env*` files committed to the repo, never `VITE_` prefix (would bundle it).
- `flightlogger.md` at repo root is gitignored locally but the original token leaked into git history at commit `24b942d` before the gitignore — that token has been rotated.
- Firestore rules: `meta/{docId}` is readable by any signed-in user, writable by members only (required by the global indicator subscription).
