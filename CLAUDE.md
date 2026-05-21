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
