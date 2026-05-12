# Copenhagen AirTaxi — Maintenance Tracker

A web app used internally by Copenhagen AirTaxi (CAT) for tracking the
maintenance status of every aircraft in the AOC / Part-145 / CAMO fleet.
The app is the day-to-day operating picture for the workshop and CAMO: what's
due, what's planned, what's grounded, what's booked into the hangar and when.

Backend: Firebase (Auth + Firestore). All data is realtime; every signed-in
client sees changes the moment they're written.

---

## 1. Sign-in & roles

Two ways to sign in:

- **Member** — email/password account. Can read and write all data.
- **Viewer** — anonymous "View only" sign-in. Read-only access to the Overview
  and Calendar. No write controls are rendered. Forecast and Settings are
  hidden from viewers entirely.

Member accounts have a **user profile** with email, display name, and
**initials**. Initials are stamped onto every audit log entry so changes are
attributable. Edit your own profile via the avatar in the top-right.

---

## 2. App layout

Sticky top bar with the CAT logo, the app title, and a nav bar:

- **Overview** — landing page, fleet status.
- **Calendar** — hangar bookings.
- **Forecast** — CAMO forecast parser (members only).
- **Settings** — master data (members only).

The right side of the bar shows the user's initials + name (or a "View only"
badge for viewers) and a sign-out button.

---

## 3. Settings (master data)

Two tabbed sections:

### 3.1 Aircraft

Fleet master data. Each aircraft has:

- **Tail number** (e.g. `OY-CAT`) — the primary key.
- **Model** (e.g. `F172M`, `TB-9`, `Islander`).

Functions:

- **Add aircraft** — create a new aircraft.
- **Edit / Delete** — per-row.
- **Seed fleet** — bulk-creates the known CAT fleet from the built-in seed
  (idempotent: skips tails that already exist).

### 3.2 Locations

Where aircraft sit when they're booked into maintenance. Used to label
bookings on the calendar and overview.

Fields: **name**, **kind** (own hangar / external sub-contractor), **notes**,
**active** flag. Inactive locations are hidden from new-booking pickers but
remain visible on the bookings that already use them (so renaming/retiring a
hangar doesn't break history).

CRUD via the table rows.

---

## 4. Maintenance Overview (landing page)

The Overview is the heart of the app. It's a dense, scannable table of every
aircraft, severity-tinted so you can spot trouble at a glance.

### 4.1 Top bar

- **Upcoming events** button — opens a fleet-wide popup showing the 25 nearest
  events by date and the 25 nearest by hours. Grounded aircraft are excluded
  (a grounded aircraft isn't burning down its timers, so its events don't
  compete for attention).
- **Import flight data** button — opens the Flightlogger CSV importer (see §10).
- **Sort bar** — sort the fleet by Severity / Tail / Model / TTAF / Next due.
  Click the same option a second time to flip direction.
- **Jump-to pills** — one pill per tail, severity-tinted. Click a pill to scroll
  to that aircraft's card. Pills stay alphabetical; a scrollspy highlights the
  pill matching the card you're currently reading. Grounded tails are
  separated to the right of the pill bar.

### 4.2 Aircraft card layout

The fleet renders as one card per tail, airworthy first, **Grounded** section
below.

**Row 1 (header):**
- Tail number, model.
- **Airworthy / Grounded toggle** — switches the aircraft between active and
  grounded.
- **In-maintenance badge** — present when today falls inside the active
  booking; shows `WO: <num>` when the booking is linked to a WO.
- **Defect badge** — count of open defects.
- **Last updated** timestamp — most recent change to the aircraft doc.
- Action buttons: **+ Event**, **+ Defect**, **+ Note** (when no note set), **Log**.

**Row 2:**
- **TTAF** (total time airframe) with the date/source it was last updated and
  a pencil to override it.
- **Booked** pill — sky-tinted ("Booked dd.mm – dd.mm") or blue ("In hangar")
  when today is inside the period. Click the pill to open the booking view;
  click the inline `+` to create a new booking.

**Note banner (conditional):** amber sticky-note banner below row 2 when the
aircraft has a free-text note (e.g. *"Waiting on spare part — ETA 2 weeks"*).
Edit pencil for members; viewers see it read-only.

### 4.3 Events list (per aircraft)

Six-column grid: **WO | Event | Status | Due at | Time left | Actions**.

- **WO** — inline-editable work-order number. Empty until set.
- **Event** — title (severity dot inline). Imported from Flightlogger or
  added manually.
- **Status pill** — *no action* (red) / *WO created* (yellow) / *WO + booked*
  (green). See §6.4.
- **Due at** — bordered compartment, two halves: calendar date | TTAF value.
- **Time left** — bordered compartment, two halves: days left | hours left.
  Each half is tinted independently (green/yellow/red).
- **Actions** — Close (green check), Edit, Delete. Plus extension and estimate
  via the row menu (see §6).

A separate **REQ** column lets you enter a logistics requisition number
alongside the WO; it's purely informational.

### 4.4 Defects list (per aircraft)

Same column geometry as events. See §7 for the actions.

---

## 5. Flight data import

Centralized button on the Overview. Accepts the standardized
`maintenance_warning_report-*.csv` exported from Flightlogger.

What it does:

- Parses each row and matches the `call_sign` column to a known aircraft tail.
  Unknown tails are surfaced so the user can dismiss or create the aircraft.
- For each event row, imports:
  - the title (`warning`),
  - the due date (`expiry_date`),
  - the due TTAF value (`timer_expiry_time`),
  - and derives the aircraft's current TTAF from `timer_expiry_time -
    log_time_left`.
- TTAF is written to the aircraft with a monotonic-increase guard — an import
  won't roll the airframe time backwards.

### 5.1 Event dedup

Imports are repeatable. Each event remembers its original Flightlogger
`warning` text in a frozen `importedWarning` field. On subsequent imports the
dedup key is **(tailNumber, importedWarning)** — so editing the visible
`warning` title (e.g. *"Next inspection…"* → *"100 Hour Inspection"*) doesn't
cause duplicates.

Closed events are **excluded** from the dedup set, so closing a recurring
event lets the next import re-create it as a fresh occurrence. This is the
intended way to roll a recurring item (e.g. 100-Hour) forward.

---

## 6. Events

Events are the maintenance items (inspections, AD/SB compliance, etc.) tracked
against each tail. Most come from Flightlogger via the CSV import; manual
events are also supported.

### 6.1 Create / edit / delete

- **+ Event** in the aircraft header opens the create dialog.
- Edit pencil and delete icon per row.
- Fields: title (`warning`), expiry date, timer expiry TTAF, work order, REQ
  number.

### 6.2 Close an event (resolution)

Mirrors defect resolution. The Close button (green check) prompts for:

- A completion date.
- A work-order number — pre-filled from the event's existing WO when one is
  set, so planned events close in one click + Enter.
- **Administrative close** checkbox — explicit waiver of the WO requirement
  for items not tracked in the WO system (e.g. AMP / ARC renewals signed off
  by the technical director). Ticking it disables the WO input.

Closed events stay in Firestore as legacy (`resolvedDate`,
`resolutionWorkOrder`, `resolvedAt`, `resolvedBy`) but are filtered out of the
active overview, the Upcoming events dialog, and the import dedup set.

### 6.3 Extend an event (CAMO concession)

CAMO can grant a short extension on top of an event's TTAF expiry. Capped at
5 flight hours per concession. The original `timerExpiryTimeMinutes` is never
mutated — the extension lives in a separate `extensionMinutes` field, so the
audit trail shows the original due time. The render-time effective expiry is
`timerExpiryTimeMinutes + extensionMinutes`.

Extensions can be edited or cleared.

### 6.4 Plan status (three states)

A derived per-event status pill:

- **unplanned** ("no action") — no WO set. Red.
- **planned** ("WO created") — WO set, no booking links the event. Yellow.
- **booked** ("WO + booked") — WO set AND a booking links the event. Green.

Same logic for defects (booking link via `defectIds`).

### 6.5 Estimate (planner notes)

Each event/defect can carry a planner **estimate**: a "reviewed" flag and an
optional man-hours guess. Independent fields — you can mark an item reviewed
without committing to a number. Pill on the row shows the state.

### 6.6 Linking to bookings

An event can be attached to a calendar booking (see §9). The link is the
booking's `eventId`; the event itself doesn't know about it directly. Booking
display logic groups linked items by WO# so the calendar tile reads naturally.

---

## 7. Defects

Free-form items reported against an aircraft (squawks, snags, deferred items).

### 7.1 Create / edit / delete

- **+ Defect** in the aircraft header opens the create dialog.
- Fields: title, reported date, reported TTAF, work order, REQ number,
  related defects (links to prior defects on the same tail — useful for
  recurrence tracking).

### 7.2 Resolve a defect

Resolution prompts for a date, a WO number (pre-filled from the defect's WO
when set), and a **resolution kind**:

- **fixed** — the underlying issue was rectified.
- **nff** — "no fault found" closure.

Resolved defects stay in Firestore as legacy but are filtered out of the
active overview.

### 7.3 Defer a defect

CAMO can defer a defect for later attention. Deferral requires a written
reason (up to 300 chars). The defect tracks `deferredAt`, `deferralReason`,
`deferredBy`.

Deferral has a **30-day review cycle**: a defect deferred more than 30 calendar
days ago is shown as "overdue review" (CAMO needs to revisit it). Re-deferring
overwrites the timestamp/reason with the new values; the audit log preserves
the chain.

A deferred defect can be **lifted** (un-deferred) from the same dialog.

### 7.4 Related defects

When creating a new defect you can link it to one or more **prior defects** on
the same tail — used to flag a recurrence. The link is unidirectional (new →
old). Titles are resolved at render time; if a referenced defect is later
deleted, the link silently drops.

### 7.5 WO# does not change defect status

Unlike events, a defect doesn't have an `unplanned`/`planned` status field —
the WO number is purely metadata. The plan-status pill is still derived
(see §6.4) but it's a render-time computation.

---

## 8. Aircraft notes

Free-text remark on the aircraft document (`note`, up to 500 chars). Shown as
a sticky-note banner under the header on the Overview.

Members add a note via **+ Note** when none is set; once set, the button hides
and the banner appears with an edit pencil. The dialog supports edit and
clear. Viewers see the banner read-only.

Typical use: short context like *"Grounded — waiting on spare part (ETA 2
weeks)"* that doesn't belong on a specific event or defect.

---

## 9. Calendar & bookings

The Calendar is one row per tail, week or month view, showing where each
aircraft is parked.

### 9.1 Views and navigation

- **Week** — Monday-anchored 7 columns. ISO week numbers shown.
- **Month** — full calendar month. Each Monday in the day-header carries its
  ISO week label.
- **Today / Prev / Next** controls. Range label + week label in the toolbar.

### 9.2 Grounded rows

Rows for non-airworthy tails get a slate background tint and a "Grounded"
subtitle. Bookings still render in normal colors — being grounded is signaled
on the tail, not on the booking (in fact grounded aircraft are the most likely
to need new bookings).

### 9.3 Bookings — fields

A booking has:

- **Tail** + **From / To** date range. `To: null` = open-ended.
- **Location** — picked from Settings → Locations (or "no location").
- **Linked event** — one event on the same tail (optional).
- **Linked defects** — any number of defects on the same tail (optional).
- **Notes** — free text.

### 9.4 Create a booking

Either click an empty calendar cell, click **New booking** in the toolbar, or
click the `+` on an aircraft's booking pill from the Overview. The dialog
shows the event dropdown and a defect checkbox list scoped to that tail.

Both linked event and linked defects are validated server-side to belong to
the booking's tail. Resolved items remain visible in the picker (so you can
see what's already linked before changing it).

### 9.5 View / edit a booking

Clicking an existing booking opens a **read-only view popup** first. The
popup shows the hangar period, duration, location, work grouped by WO#, and
notes. Members see an **Edit** button that promotes the view into the editor.

Display rules:

- Items are **grouped by WO#**. The event's group renders first as the parent;
  defect-only WO groups follow; items with no WO# come last.
- Within a group, the event sorts before its defects.
- Resolved items keep their link but render strikethrough with a small check
  icon — closed work stays visible on the calendar.

### 9.6 Auto-expiry sweep

Once per session (when the Overview first loads, for members only), a
client-side sweep clears bookings whose `to` date is in the past. Implemented
as a Firestore transaction with a timestamp guard, so concurrent clients can't
double-clear. Open-ended bookings (`to: null`) are left alone.

The audit log entry reads
`Aircraft left maintenance hangar (booked DD.MM.YYYY – DD.MM.YYYY)`.

---

## 10. TTAF (Total Time Airframe)

Stored as integer minutes; displayed everywhere as `HH:MM` (e.g. `2448:36`)
so it can't be confused with decimal hours.

### 10.1 Manual update

The pencil on the TTAF cell opens a dialog to override the imported value.
Use cases: correcting an import error, post-flight update without re-running
the import.

### 10.2 Smart input parser

TTAF/timer-expiry inputs auto-detect the format based on the separator:

- `:` → sexagesimal (e.g. `6466:36` → 6466h 36m)
- `.` → decimal hours (e.g. `4969.5` → 4969h 30m)
- plain integer → whole hours

A small `HH:MM` / `Decimal` indicator next to the field lights up live so you
can confirm the parser interpreted what you typed.

### 10.3 Monotonic guard

Imports never decrease the stored TTAF. If you genuinely need to roll back
(import error), use the manual override — it's the only path that allows
TTAF to go down.

---

## 11. Severity model

Per-event severity is the worst of two dimensions:

- **Days left** (calendar):
  - `≥ 7 days` → green
  - `0–6 days` → yellow
  - `< 0 days` → red
- **Hours left** (TTAF):
  - `≥ 10h` → green
  - `0–10h` → yellow
  - `< 0h` → red

Aircraft-level severity is the worst of all its events. Pills, cards, and the
"Time left" compartment all use the same scale; the two halves of "Time left"
tint independently.

---

## 12. Audit / transaction log

Every CRUD action is logged to the per-aircraft transaction log with date,
time, user initials, and a human-readable summary.

Open the log via the **Log** button on the aircraft header.

The dialog has:

- **Search box** (matches summary text + initials).
- **Entity filter chips** — Aircraft / TTAF / Booking / Event / Defect / Note.
- **Action filter chips** — Create / Update / Delete.
- **Month grouping** — entries collapsed under headers like
  `May 2026 · 12 entries`. Current and previous month open by default; older
  months collapsed.
- **Just now** group at the top for entries whose server timestamp hasn't
  landed yet (so a fresh write isn't invisible during the round-trip).
- When filters or search are active, every group containing matches
  auto-expands; clearing filters reverts to the manual open-state.
- Subscription limit: **500 entries**.

Example summaries:

- `WO 6600 → 6711` (event update).
- `Event closed: "100 Hour Inspection" (WO 6711, on 02.05.2026) at TTAF 2448:36`.
- `Aircraft left maintenance hangar (booked 01.05.2026 – 05.05.2026)`.

---

## 13. Forecast module (members only)

A standalone module for parsing CAMO `.docx` Forecast / Projection List
exports into a structured cheat sheet for the next work order.

Workflow:

1. Upload a `.docx` from CAMO.
2. The parser extracts the tail number from the header and validates it
   against the fleet (`Settings → Aircraft` must contain it).
3. Each row is canonicalized against `event_dictionary.json` (locked at 718
   clusters, 8 models). AD events outrank SBs when an AD wraps an SB; same-
   action multi-interval items collapse to the smallest interval.
4. Rows are grouped by forecast section and rendered as a tabular preview.

Models not in the dictionary still render rows with raw names and
`needs review` badges.

The runtime parser and bare UI exist; deeper integration with the events
collection is not wired yet.

---

## 14. Cross-cutting behavior

### 14.1 View-only mode

When signed in anonymously:

- All write buttons are hidden / disabled.
- Forecast and Settings nav links are hidden.
- Booking view popup is shown without an Edit button.

### 14.2 Realtime sync

All collections (aircraft, events, defects, bookings, locations, users) are
subscribed via Firestore `onSnapshot`. Any edit lands on every open client
within a second.

### 14.3 Branding

CAT logo in the app header (small) and on the login screen (large); favicon
wired in `index.html`.

---

## 15. Data model — quick reference

| Collection      | Key fields                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `aircraft`      | tailNumber, model, airworthy, totalTimeMinutes, totalTimeSource, note                                     |
| `events`        | tailNumber, warning, importedWarning, expiryDate, timerExpiryTimeMinutes, workOrderNumber, status, extensionMinutes, estimated, estimatedManHours, resolved* |
| `defects`       | tailNumber, title, reportedDate, reportedTtafMinutes, workOrderNumber, relatedDefectIds, deferredAt, deferralReason, resolutionKind, resolved* |
| `bookings`      | tailNumber, from, to, eventId, defectIds[], locationId, notes                                             |
| `locations`     | name, kind (hangar/external), notes, active                                                               |
| `users`         | uid, email, initials, displayName                                                                         |
| `audit` (per-aircraft) | date, time, user uid + initials, entity, action, summary                                           |

All timestamps are Firestore `Timestamp`. All durations are integer minutes.
