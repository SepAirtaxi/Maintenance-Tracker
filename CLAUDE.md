# Project guidance for Claude

## Keep `APP_OVERVIEW.md` in sync

`APP_OVERVIEW.md` (in the repo root) is the human-readable map of every
feature in the Maintenance Tracker — what it does, where it lives, and how
sub-features relate (e.g. defect resolution vs. deferral, event close vs.
extend, booking links, severity rules, audit log behavior).

**When to update it:**

After making any change that alters user-visible behavior, you MUST review
`APP_OVERVIEW.md` and update the relevant section(s) in the same change.
Triggers include — but aren't limited to:

- Adding, removing, or renaming a page, route, dialog, or top-level button.
- Changing what a feature does (new flow, new field on a form, new validation,
  changed default).
- Adding or modifying a sub-feature (e.g. a new resolution path, a new pill
  state, a new audit entry shape, a new filter).
- Changing data-model fields that surface in the UI (new field on
  `MaintenanceEvent`, `Defect`, `Booking`, `Aircraft`, `Location`, etc.).
- Changing severity thresholds, dedup keys, monotonic guards, or any other
  rule the overview spells out.
- Changing role/permission behavior (what viewers see vs. members).

**When NOT to update it:**

- Pure refactors with no user-visible change (renaming an internal helper,
  splitting a component, reorganizing files).
- Styling tweaks that don't alter the feature's behavior or structure.
- Bug fixes that restore documented behavior — the overview was already
  correct, the code wasn't.

**How to update:**

- Edit the section that the change touches, in place. Don't bolt new sections
  onto the end when an existing section already covers the area.
- Match the existing tone: short paragraphs, bullet lists for fields/actions,
  tables only where they earn their keep. Aviation-fluent — assume the reader
  understands TTAF, AD/SB, CAMO, Part-145.
- Keep examples concrete: real field names, real example values (`OY-CAT`,
  `2448:36`, `WO 6711`).
- If you introduce a wholly new feature area, add a new numbered section in
  the logical spot and renumber subsequent sections.

**If unsure whether a change is overview-worthy:** err on the side of
updating. A short note about a new sub-behavior is cheaper than a stale
overview.
