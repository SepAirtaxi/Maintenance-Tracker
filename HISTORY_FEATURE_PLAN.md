# History feature — implementation plan

This document is a self-contained plan for a future Claude Code session. Read this in full before starting; do not skim. Ask the user (sep@aircat.dk) before deviating from the structure below.

## What we're building, in plain words

Today each aircraft card has a "Log" button that opens an audit-log dialog. The user wants to evolve that into a more general **History** view. The motivation is two-sided:

1. **Distinguish "fixed" from "no fault found" (NFF) when closing a defect.** Currently a defect has one resolution path: set a date + WO# and it's filtered out of the active overview. The user — head of an AOC + Part-145 + Part-M CAMO operation — needs to track defects that were closed NFF separately, because recurring NFF closures on the same aircraft are operationally significant (e.g. an autopilot fault that only manifests at altitude and a lazy mechanic writes off as "no fault found"). Deferred defects are NOT a separate state — in this app, "deferred" just means "still open, no resolution yet." No data model change for deferred.
2. **Make per-tail history easy to look up.** Instead of adding more buttons to the aircraft card, the existing "Log" button becomes "History" and opens a tabbed dialog covering activity, defects, and events.

## End state (what the user agreed to)

- Defects gain a `resolutionKind: "fixed" | "nff"` field.
- The Resolve Defect dialog asks for date + WO# + Fixed/NFF choice.
- The "Log" button on each aircraft card is renamed "History" (with the same icon).
- The dialog becomes tabbed:
  - **Activity** — current audit log content, unchanged.
  - **Defects** — every defect ever recorded on this tail, grouped: *Open* / *Resolved* / *Closed NFF*. NFF rows visually distinct.
  - **Events** — every event ever recorded on this tail, grouped: *Open* / *Closed*. Each row shows title, WO#, resolution date, who closed.
- Existing already-resolved defects (if any exist) are treated as `"fixed"` by default. The user confirmed there likely are none yet, so legacy migration risk is low.

## Codebase context (verified at time of writing)

- `src/types.ts` — `Defect` and `MaintenanceEvent` both already carry `resolvedDate`, `resolutionWorkOrder`, `resolvedAt`, `resolvedBy`. Resolved entities stay in Firestore; the active overview filters them out.
- `src/services/defects.ts` — `resolveDefect()`, `subscribeDefects()`, `docToDefect()`. Audit log calls go through `logAudit()` from `src/services/audit.ts`.
- `src/services/events.ts` — same shape as defects for resolution metadata; `resolveEvent()` and `subscribeEvents()` exist.
- `src/components/overview/ResolveDefectDialog.tsx` — single-button resolve dialog. This is the file that gets the Fixed/NFF toggle.
- `src/components/overview/AuditLogDialog.tsx` — current "Log" dialog. Title is "Transaction log — {tail}". Will be renamed and refactored into a tabbed History dialog. Keep all existing audit-log filtering logic.
- `src/components/overview/AircraftCard.tsx` — the "Log" button is around the `onOpenEditLog` handler near the end of the action row (line ~279–288 at time of writing). Uses the `History` lucide icon already.
- `src/pages/OverviewPage.tsx` — likely owns the audit-log dialog state and the `onOpenEditLog` callback. Verify before editing.
- The audit log already supports filtering by entity (aircraft / ttaf / booking / note / event / defect). Don't break those.

## Memory notes that apply

The user's auto-memory (`~/.claude/projects/.../memory/`) contains:

- `project_defect_resolution.md`: states defects are resolved (WO# + date), kept as legacy, filtered out of overview. **After Stage 1 lands, update this memory** to add the `resolutionKind` distinction.
- `feedback_overview_ui.md`: validated dense pill-based layout with severity-tinted cards. Match this style — don't import airier shadcn defaults into the History dialog.

The user is aviation-fluent; aviation terminology is fine in code and UI ("NFF", "WO#", "TTAF").

---

## Stage 1 — Data model + Resolve Defect flow

**Goal**: capture Fixed vs NFF at resolution time, without changing how the active overview behaves.

### Type changes
- `src/types.ts` — add to `Defect`:
  ```ts
  resolutionKind: "fixed" | "nff" | null;
  ```
  `null` for unresolved defects. Set together with the other resolution fields.

### Service changes
- `src/services/defects.ts`:
  - In `docToDefect()`, default missing/undefined `resolutionKind` to `null` if `resolvedAt` is null, otherwise `"fixed"` (legacy default — assume any pre-existing resolved defect was fixed).
  - Extend `ResolveDefectInput` with `resolutionKind: "fixed" | "nff"`.
  - In `resolveDefect()`, write the new field. Update the audit summary to include the kind:
    - Fixed → `Defect resolved (fixed): "..." (WO ..., on ...)`
    - NFF → `Defect closed NFF: "..." (WO ..., on ...)`
  - Initial defect creation continues to set `resolutionKind: null` (or omit and let `docToDefect` default it).

### UI changes
- `src/components/overview/ResolveDefectDialog.tsx`:
  - Add a clearly-labelled choice control (radio group or two toggle buttons) for **Fixed** / **No fault found**. Default: Fixed.
  - Replace the single submit button with two: *Mark resolved* (submits with `"fixed"`) and *Close NFF* (submits with `"nff"`). Either is acceptable — implementer's call — but the chosen kind must be obvious before submit.
  - Update the dialog description to explain the difference briefly: e.g. "Fixed: fault found and corrected. No fault found: closed without a confirmed fix."
  - Pass `resolutionKind` through to `resolveDefect()`.

### Acceptance for Stage 1
- New defects can still be created and resolved as today.
- The Resolve dialog requires a kind choice.
- Firestore documents for newly-resolved defects carry `resolutionKind`.
- Audit log entries reflect the kind in their summary.
- No visual change anywhere else yet.

---

## Stage 2 — Rename Log → History, tabbed dialog with Activity + Defects

**Goal**: turn the existing audit-log dialog into a tabbed History dialog and add the Defects tab.

### Renaming
- `src/components/overview/AircraftCard.tsx`:
  - Change the button label "Log" → "History". Tooltip "Show transaction log" → "Show history". Keep the `History` lucide icon.
- `src/components/overview/AuditLogDialog.tsx`:
  - Rename file to `HistoryDialog.tsx`. Update imports in the page that uses it (likely `src/pages/OverviewPage.tsx`).
  - Rename the default-exported component `AuditLogDialog` → `HistoryDialog`.
  - Dialog title "Transaction log — {tail}" → "History — {tail}".
  - Description copy adjusted to fit the broader scope.

### Tab structure
Use shadcn `Tabs` (check `src/components/ui/` for an existing tabs primitive; if absent, add one — the project already uses shadcn). Tabs:
1. **Activity** — current audit-log body. Lift the existing search/filter/groups UI into this tab. Behaviour unchanged.
2. **Defects** — see below.

The dialog should remember which tab the user was on per session is NOT required — defaulting to Activity is fine.

### Defects tab
- Subscribe to defects for the current tail (filter `subscribeDefects` by tail, or add a `subscribeDefectsByTail(tail, cb)` helper to `src/services/defects.ts` if cleaner).
- Group into three sections, in order:
  1. **Open** — `resolvedAt == null`. Sort newest reportedDate first.
  2. **Resolved** — `resolvedAt != null && resolutionKind === "fixed"`. Sort newest resolvedDate first.
  3. **Closed NFF** — `resolvedAt != null && resolutionKind === "nff"`. Sort newest resolvedDate first.
- Each row shows:
  - Title
  - Reported date · TTAF when reported
  - Initial WO# (the one captured at creation, if any)
  - For closed groups: resolution date · resolution WO# · resolved-by initials
- Visual styling:
  - Match the dense pill-based aesthetic (see `feedback_overview_ui.md`).
  - Open: neutral.
  - Resolved (fixed): subtle green tint.
  - Closed NFF: amber/orange tint, distinct enough to scan-spot. Do NOT use red — NFF is not an error state, just one to keep an eye on.
- Empty-state copy per group: "No open defects.", "No resolved defects.", "No NFF closures."

### Acceptance for Stage 2
- "History" button opens a tabbed dialog. Activity tab shows what the old Log dialog showed.
- Defects tab shows the three groups, correctly filtered.
- NFF defects visually distinct from Resolved defects.
- Dialog is responsive within the existing `max-w-2xl` style (or widen to `max-w-3xl` if needed for the defects rows; check both).

---

## Stage 2.5 — Recurrence linkage at report time

**Goal**: when reporting a new defect on a tail that has prior NFF closures, surface those prior closures so the reporter can (a) reuse the title verbatim to keep wording consistent, and (b) persist a link from the new defect to the prior one(s). The persistent link is what pays off later — it makes recurrences scannable in the History dialog instead of being a one-shot prompt at creation time.

This stage is **purely additive** and depends only on Stage 1 (`resolutionKind`). Stage 2 adds the surface where the linkage shows up later (Defects tab), but Stage 2.5 does not depend on Stage 2 shipping first — they could in principle land in either order.

### Type changes
- `src/types.ts` — add to `Defect`:
  ```ts
  // IDs of prior defects on the same tail that this defect is reported as a
  // recurrence of. Unidirectional (new → old). Empty array when none.
  relatedDefectIds: string[];
  ```
  Empty array (`[]`) for defects with no recurrence link. Mirrors the booking→event/defect render-time-resolution pattern: store IDs, look up labels at render time, tolerate dangling refs.

### Service changes
- `src/services/defects.ts`:
  - `DefectInput` gains `relatedDefectIds?: string[]` (optional at the API; defaults to `[]` when writing).
  - `createDefect()` writes the array. Validation: each id must reference a defect on the same tail; silently drop ids that don't match (defensive — IDs can only come from the picker, but a Firestore race could leave one stale).
  - `updateDefect()` accepts `relatedDefectIds` updates so the link can be edited after creation.
  - `docToDefect()` defaults missing/undefined `relatedDefectIds` to `[]` (legacy compatibility — no migration script).
  - Audit summary on create: append `(recurrence — linked to N prior)` when the array is non-empty. Leave "Defect reported: …" prefix alone.
  - Audit summary on update: if `relatedDefectIds` changes, log `Defect "…" links updated: was N, now M`. Don't enumerate IDs in the summary; the History dialog renders titles from the live data.

### UI changes
- `src/components/overview/DefectFormDialog.tsx` (the create/edit dialog used by both "Report defect" and "Edit defect"):
  - Compute `priorNffDefects` for the tail: defects on the same tail with `resolvedAt != null && resolutionKind === "nff"`. Sort newest `resolvedDate` first. Filter out the defect being edited (if any) so a defect can't link to itself.
  - **Only render the panel when `priorNffDefects.length > 0`.** Empty list = no panel = no noise.
  - Panel: collapsible, default *closed* if there are no current links, default *open* if the defect being edited already has links (so they're visible at a glance).
  - Header: `Prior NFF closures on this tail (N)` with a chevron toggle.
  - Each row shows: title, `Closed {date}`, `WO {resolutionWorkOrder}`. Match the amber tint used on the History → Defects tab for NFF rows so the visual language is consistent.
  - Per-row controls:
    1. **Use title** — button. Copies the prior defect's title verbatim into the form's title field. Does not auto-link; that's a separate decision.
    2. **Link** — checkbox. Toggles inclusion in `relatedDefectIds`. Multiple links allowed.
  - Below the form's title field, render a small inline indicator when ≥1 row is linked: e.g. `Linked to N prior NFF closure(s)`. Reinforces what's about to be saved without forcing the user to scroll back.

- `src/components/overview/HistoryDialog.tsx` — Defects tab:
  - Each defect row that has a non-empty `relatedDefectIds` renders an extra line: `Follows up on: "{title}" (NFF {date})` — one entry per link, comma-separated if multiple.
  - Resolve titles by looking each id up in the per-tail defects already in scope. If a linked id no longer exists on this tail (deleted, or moved tails), skip it silently. If *all* links resolve to nothing, omit the line entirely.
  - Keep this line subtle (small text, muted colour) — it's secondary metadata, not the headline.

### What NOT to do (explicit non-goals)
- **No fuzzy/auto-matching.** Don't suggest links by title similarity. The user explicitly ruled out automatic recurrence detection in the original plan; manual picker only.
- **No bidirectional render in v1.** The prior NFF defect does not get a "later report" backlink in its row. Could be added later trivially (scan all defects on the tail for ones whose `relatedDefectIds` includes this one's id) but is not in scope here.
- **No prior-fixed surfacing in v1.** Only NFF closures show in the picker. A "show prior fixed too" toggle is reasonable v2 polish — ship it later if needed.
- **No cross-tail links.** Picker is scoped to the same tail. Cross-tail patterns are a different problem and not what the user asked for.

### Acceptance for Stage 2.5
- Reporting a defect on a tail with no prior NFFs: dialog looks unchanged.
- Reporting a defect on a tail with prior NFFs: collapsible panel appears, lists those NFFs with Use-title and Link controls.
- "Use title" copies the title into the form field (overwriting whatever was there — confirm acceptable; alternatively prompt only if the field already has content).
- Saving with ≥1 link writes `relatedDefectIds` correctly. Audit summary reflects the linkage.
- Editing an existing defect with links: panel opens with the linked rows already checked.
- History → Defects tab: linked defects show the "Follows up on" line. Deleting a linked-to defect does not break the linking defect's row (silently omits the missing link).
- No legacy data breaks: defects without the field read as `[]`.

---

## Stage 3 — Events tab

**Goal**: add closed-events history so CAMO lookups ("when did we last do X inspection?") work in one click.

### Events tab
- Subscribe to events for the current tail (analogous to defects; add `subscribeEventsByTail` if needed).
- Group into two sections, in order:
  1. **Open** — `resolvedAt == null`. Sort by upcoming due date (soonest first), nulls last.
  2. **Closed** — `resolvedAt != null`. Sort newest resolvedDate first.
- Each row shows:
  - Warning/title
  - Original due date · TTAF expiry (if set)
  - Initial WO# / REQ# (if any)
  - For closed: resolution date · resolution WO# · resolved-by initials
- No "kind" distinction for events — they're either open or closed. Events don't have NFF semantics in this app.

### Acceptance for Stage 3
- History dialog now has three tabs: Activity / Defects / Events.
- Events tab correctly partitions open vs closed and renders required fields.
- Performance: subscribing to per-tail filtered queries shouldn't cause noticeable lag. If using client-side filtering of the existing global `subscribeEvents`/`subscribeDefects` is simpler at our scale (<20 tails, modest event/defect counts), that's acceptable.

---

## Things to be careful of

- **Don't break the audit-log filters.** The Activity tab must keep entity (aircraft/ttaf/booking/note/event/defect) and action (create/update/delete) filters working exactly as before.
- **Audit summary formatting.** When extending defect-resolution audit summaries with the kind, keep the existing pattern (`Defect resolved: "..."`) recognisable — the user has a project-defect_resolution memory entry that references this. Either keep "Defect resolved:" prefix and append `(fixed)`, or use distinct prefixes ("Defect resolved (fixed):" / "Defect closed NFF:") — implementer's call but be consistent.
- **Legacy data.** Any defect document already in Firestore without a `resolutionKind` field: treat as `"fixed"` if `resolvedAt` is set, else `null`. Done in `docToDefect`. No migration script needed.
- **Booking history is intentionally NOT in this plan.** If asked to add it, push back — the audit log already covers it.
- **Don't add features beyond what's specified.** No fuzzy recurrence detection, no "related-to" links, no analytics. The user explicitly said they just want manual lookup; they don't need automatic similarity detection.

## Post-implementation memory updates

After Stage 1 ships, update `~/.claude/projects/C--sepic-Maintenance-Tracker/memory/project_defect_resolution.md` to add: defects now carry `resolutionKind: "fixed" | "nff"`; legacy resolved defects are treated as `"fixed"`; NFF closures are tracked separately in the History dialog.

After Stage 2/3 ship, consider a new `feedback_history_dialog.md` if the user gives validation feedback worth preserving (e.g. specific colour choice for NFF).

## Suggested order of work

1. Stage 1 end-to-end (smallest blast radius — purely additive).
2. Show user, confirm Fixed/NFF UX feels right.
3. Stage 2 (rename + tabs + Defects tab).
4. Show user, confirm visual treatment of NFF rows.
5. Stage 2.5 (recurrence linkage at report time). Order is flexible — could also land after Stage 3 — but it's most useful immediately after Stage 2 because the History dialog is where the link surfaces for later reading.
6. Show user, confirm the picker doesn't feel intrusive on tails with many prior NFFs.
7. Stage 3 (Events tab).

Each stage should be one commit (or one branch + PR if the user prefers — ask first).
