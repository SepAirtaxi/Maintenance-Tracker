Copenhagen AirTaxi Maintenance Tracker:

// User Notes //
The purpose:
An internal collaborative tool for an easy overview of the fleet of aircraft in service with Copenhagen AirTaxi.
This will mainly be used/updated by the Part-145/CAMO.

User Interface:
A) The Maintenance Overview:
The landing page should be what is basically an advanced table. It should be parted up into aircraft tail numbers, and each aircraft has their own container with relevant data. It should be parted into a two-level hierarchy; Tail number (parent), Events (children):
- Tail number: Displays the tail number. Pulled from master data.
- Model: E.g. F172M, TB-9, Islander etc. Pulled from master data.
- Total Time: Shows the latest updated TTAF, including a date stamp of when the TTAF was last updated.
- Edit Log: A clickable button which prompts a pop up with the (latest) edit history events on the specific tail number (see below under functions).
- Next due event(s): Shows the event title and when it's due. Should show hours/days left as well as the TTAF timer expiry/due value. The values should show green/yellow/red for not due, almost due and overdue.
-- Event status: Unplanned/Planned. This updates in accordance with whether the user has entered a WO number (see below).
-- WO Number: Work order numbers are manually entered by users on due events. When a WO number is entered, the status for the event will update to planned.
-- Next Booked Maintenance: The date range of when the plane is next scheduled for maintenance in the hangar workshop. This is updated manually by users, using a date picker. Non-mandatory.


Functions (in random order):

A) Flight Data Import:
The app needs a centralized/focused button function to upload a standardized csv document which is exported from our flight planning system (Flightlogger) and contains data for multiple aircrafts. I have inserted a sample document that shows the formatting of the sheet (\sample\maintenance_warning_report-2026_04_24_06_46_41.csv).
- The following columns is what it needs to read and import:
-- call_sign: Aircraft tail number, this identifies/determines the aircraft entity to update the data for. This needs to link to the app's fleet master data, if there's a mismatch or discrepancy (as in the csv has an unknown tail number), it needs to be flagged and the user can choose to dismiss or create the aircraft.
-- warning: The title of the event that is next due (note, can be more than one)
-- days_left: The amount of days remaining until due (this is considered crucial information).
-- log_time_left: The amount of flight hours remaining until the event is due (this is considered crucial information).
-- expiry_date: The due date for the event (ddmmyyyy) (this is considered crucial information).
-- timer_expiry_time: The value of the airframe total time when the event is due
-In relation to importing the above-mentioned parameters, it also needs to calculate the aircraft's current total time (TTAF). This is done by subtracting the log_time_left from the timer_expiry_time. The TTAF is also a very crucial part of managing aircraft maintenance.
 
 
B) Quick Update of flight hours/landings:
- On the overview, there needs to be a function to quickly enter updated TTAF (total time airframe) and/or landings. The user can click a button to update the metrics for the specific aircraft, then enter TTAF and/or landings and hit update, and this will then manually overwrite the calculated TTAF from the data import. This can also be used to reduce time (in case of errors), so it is an option for total user override of imported data (if necessary).
 
C) Transaction log:
All changes or updates (everything CRUD), needs to be logged with date/time/user on the aircraft tail-number level. The log is intended to be used for both auditing purposes but also as a tool, so each aircraft needs a function/button to easily see the transaction log in chronological order. It should show date, time, user, and a note with what parameter was created, updated or deleted.
 
D) User auth:
I plan to utilize firebase/firestore for the back end, so I want to use Firebase auth for this. We also need a way to track user names or initials, not only email addresses.

F) Aircraft data:
A master data section with CRUD operations for the aircraft. Please read \sample\fleetdata.png and extract the fleet data so you can do an initial data seed.

G) Events:
Most events are pulled automatically from the above-mentioned flight data, but there neeeds to be an option to CRUD events manually as well.

H) Defects:
Option to CRUD defects on tail number level. Requires a free text field for the title of the defect, a report date and TTAF at the time of the defect was reported.




Other:

Firebase info:
const firebaseConfig = {
  apiKey: "AIzaSyCoWyXHGKvS12Ln_dHdC_tnMXTDyEuGfI8",
  authDomain: "maintenancetracker4000.firebaseapp.com",
  projectId: "maintenancetracker4000",
  storageBucket: "maintenancetracker4000.firebasestorage.app",
  messagingSenderId: "1035097408497",
  appId: "1:1035097408497:web:61c5b44abf114284e0fa50",
  measurementId: "G-18FH15FJ9B"
};



// Claude Notes //

---

## Implementation notes (additions beyond the original spec)

### Defects — resolution flow
- Defects can be **resolved**, in addition to edited/deleted. Resolving prompts for a work-order number and resolution date, then marks the defect as legacy.
- Resolved defects are kept in Firestore (`resolvedDate`, `resolutionWorkOrder`, `resolvedAt`, `resolvedBy` fields) but filtered out of the active overview.
- The audit log captures the resolution with WO number and date.

### Events — close (resolution) flow
- Events can be **closed**, in addition to edited/deleted. Closing prompts for a completion date and a work-order number, ties the event to that WO, and marks it as legacy. Mirrors the defect resolution model — same four fields on the event document (`resolvedDate`, `resolutionWorkOrder`, `resolvedAt`, `resolvedBy`).
- The dialog **pre-fills the WO field** from the event's existing `workOrderNumber` when one is set (planned events close in one click + Enter); for unplanned events the WO field is empty and auto-focused.
- Closed events stay in Firestore but are filtered out of:
  - the active overview cards (per-aircraft event list);
  - the **Upcoming events** dialog;
  - the **CSV import dedup set** — so the next import re-creates a fresh occurrence of the same recurring item (e.g. the next 100-Hour after closing the previous one). This is the intended way to roll a recurring event forward.
- Audit log entry uses the form `Event closed: "<warning>" (WO <num>, on <date>) at TTAF <ttaf>`.

### Event row layout
- Six-column grid: **WO | Event | Status | Due at | Time left | Actions** (`EVENTS_GRID_COLS` in `EventRow.tsx`).
- WO is the leftmost column (sized for short numeric work-order numbers, e.g. `6600`); the severity dot now lives inline next to the event name rather than as its own column.
- **Due at** and **Time left** are each rendered as a single bordered "compartment" containing two halves (`Date | TTAF` and `Days | Hours`) split by a vertical divider. Severity tinting in Time left is applied **per half** so each value reads independently.
- The header row mirrors that compartment style: each compartment has the supergroup label (`Due at` / `Time left`) stacked above its two sub-labels inside the same border, so the header structure visually matches the data row.
- Actions column holds three icon buttons in this order: **Close** (green check), **Edit**, **Delete**.

### Aircraft header — two-row layout
- **Row 1:** tail number, model, airworthy/grounded toggle, in-maintenance badge (appends `WO: <num>` when the active booking has a linked event with a WO#), defect badge, "Updated <date>" (latest aircraft-doc `updatedAt`), and Event/Defect/Note/Log action buttons.
- **Row 2:** TTAF as a fixed-column grid cell (predictable positions for value, meta date/source, edit pencil); Booked as a distinctive sky-tinted pill (or blue "In hangar" when today is within the active booking) — see *Maintenance calendar / bookings* below for content layout.
- **Note banner (conditional):** when the aircraft has a free-text note set, an amber sticky-note banner appears below row 2 with the note text and an edit pencil (members only).
- "Updated <date>" reflects any change to the aircraft document — TTAF, model change, airworthiness toggle, note. (Bookings live in their own collection now and don't bump the aircraft `updatedAt`.)

### Aircraft notes
- Free-text remark field on the aircraft document (`note: string | null`). Up to 500 characters.
- Intended for context that doesn't belong on a specific event/defect — e.g. *"Grounded — waiting on spare part (ETA 2 weeks)"*.
- Members add a note via the **+ Note** button in the header action group (visible only when no note is set). Once set, the button hides and the note renders as an amber banner with an edit pencil; the dialog supports edit and clear.
- Viewers see the banner read-only.
- Audit log entity is `note` with create/update/delete actions; summaries include before/after text. The audit log dialog includes `Note` in the entity filter chips.

### Upcoming events dialog
- Top-level **Upcoming events** button on the overview, next to **Import flight data**.
- Opens a popup with the 25 nearest events by date and 25 nearest by hours, fleet-wide. Severity-tinted (red/yellow/green) using the same thresholds as the per-aircraft rows.
- Events on **grounded** aircraft (`airworthy === false`) are filtered out of both lists — a grounded aircraft is by definition not flying down its TTAF/calendar timers, so its events shouldn't compete for attention with the active fleet.

### TTAF / duration format
- Stored as integer minutes (base-60). Display everywhere in the app uses `HH:MM` (e.g. `2448:36`) so it's unambiguously not decimal hours.
- The shared parser in `src/lib/time.ts` accepts either `HH:MM` or `HH.MM` on input — Flightlogger CSV uses `:`, older CAMO `.csv` exports use `.`. Either works.
- TTAF/timer-expiry inputs (`TtafDialog`, `EventFormDialog`, `DefectFormDialog`) have a **HH:MM / Decimal** toggle next to the field label. HH:MM is the default. Switching modes auto-converts the current value (if it parses) so the number isn't lost.
- **Decimal** mode parses decimal hours (e.g. `4969.5` → 4969h 30m), strips thousands-spaces (CAMO formats numbers like `4 969.5`), and rounds to the nearest minute. Use it when transcribing TTAF directly from the CAMO software's projection lists. Internal storage stays integer-minutes regardless of input mode.

### Booked maintenance — auto-expiry sweep
- Bookings auto-clear on the day after their `to` date. The sweep runs client-side once per session when the overview first loads (skipped for viewers).
- Implemented as `sweepExpiredBookings` in `services/aircraft.ts`. Uses `runTransaction` with a from/to-timestamp guard so concurrent clients can't double-clear or double-log.
- Open-ended bookings (`to: null`) are left alone — they require manual clear.
- Audit entry on auto-clear: `Aircraft left maintenance hangar (booked DD.MM.YYYY – DD.MM.YYYY)` (action: `delete`, entity: `booking`).

### Audit log dialog — filter + search
- The transaction log dialog has a search box (matches summary + initials) and two rows of multi-select chips: **Entity** (Aircraft / TTAF / Booking / Event / Defect) and **Action** (Create / Update / Delete).
- Empty filter set = "all" for that axis. A `Clear` button appears when any filter is active. A live "X of Y entries" counter shows how much the filters narrowed the view.
- Subscription limit is **500** entries (up from 200) so the filter has more to work with on aircraft with long histories.
- The flat list remains the underlying view; the planned grouped-per-entity ("history") view would layer on top of the same data without removing this one.

### Bookings — linked event + linked defects
- A booking can link **one event** (`eventId`) and **any number of defects** (`defectIds: string[]`) on the same tail. Both are validated server-side (defect/event must belong to the booking's tail).
- The dialog has the existing event dropdown plus a checkbox list for defects. Resolved-but-still-linked items remain visible in the picker so users can see what's there before changing it (matches the existing event-link behavior).
- Display logic lives in `src/lib/bookingDisplay.ts` (`buildBookingGroups` + `describeBookingGroups`) and is shared by both the calendar block and the Overview "In hangar"/"Booked" tile.
  - Items are **grouped by WO#**. The event's group is rendered first (the parent); defect-only WO groups follow; items with no WO# come last.
  - Within a group: event before defects.
  - Resolved items keep their link but render with `line-through` + a small `Check` icon so closed work is still visible on the calendar.
- Audit log captures defect labels and WO# alongside the event, same format pattern as before.

### Calendar — grounded aircraft rows
- Rows for non-airworthy tails (`airworthy === false`) get a slate background tint and a "Grounded" subtitle in the tail-cell. The cell label alone signals the status — no centered watermark across the row.
- Bookings on a grounded tail render with their normal sky/blue colors — the tail being grounded is what's signaled, not the booking. The rationale is that grounded aircraft are exactly the ones most likely to need new bookings to return to service.

### Calendar — week view starts on Monday
- The 7-day week view is anchored to **Monday** as the leftmost column (ISO week convention). Initial mount, "Today", prev/next, and switching from month → week all snap the anchor to the Monday of the current week.
- Month view is unchanged — it always renders the calendar days of the anchored month.

### Calendar — booking view popup
- Clicking a booking block opens a **read-only view popup** by default, not the editor. The popup shows hangar period, duration, work grouped by WO# (with event/defect badges and resolved strikethroughs), and notes.
- The popup has an **Edit** button that closes the view and opens the existing `BookingDialog` editor. Viewers see the popup without the Edit button.
- The view mirrors live data: if the underlying booking changes while the popup is open, the popup re-renders with the latest values.

### Defects — resolve dialog pre-fills WO
- `ResolveDefectDialog` pre-fills the resolution WO field from the defect's `workOrderNumber` when one is set, mirroring `ResolveEventDialog`. Auto-focus moves to the date field when WO is pre-filled (and stays on the WO field when it's empty).

### Dialog input styling
- Form inputs (`Input`, the booking event `<select>`, the booking defect checkbox list, and the note `<textarea>`) use `bg-card` (white) so they stand out against the grey dialog body. Disabled inputs use `bg-muted` to read as inert.

### Overview — aircraft filter dropdown
- Sort bar has a multi-select tail filter next to the sort options. Session-only state (resets on reload), all aircraft included by default.
- Filter logic stores **excluded** tails (not included), so newly-added aircraft show up automatically without a re-tick.
- Click behavior: **checkbox** toggles add/remove additively; **clicking the tail name** solos to that one tail (sets every other tail to excluded). The dropdown header has Select all / Unselect all and a one-line hint.

### Defects — work order field
- `Defect.workOrderNumber: string | null`. Same input semantics as events: an inline-editable cell on the defect row plus a field on the create/edit dialog.
- `WorkOrderCell` was made entity-agnostic (takes `value` + `onSave`) so events and defects share the same inline-edit UX.
- Unlike events, **a defect's WO# does not change its status** — defects don't have planned/unplanned. The WO# is purely metadata for cross-referencing maintenance work.

### "Last updated:" prefix
- Aircraft header timestamp and TTAF cell both display `Last updated: <date>` rather than `Updated <date>` / a bare date. Convention applies anywhere a "last updated" timestamp is shown to the user.

### Branding — logo and favicon
- `src/img/logo.png` shown small (`h-7`) next to the title in the app header, larger (`h-16`) above the title on the login screen.
- `src/img/favicon.ico` + `favicon.png` both wired in `index.html`; browsers pick the best fit.

### Event identity (import dedup)
- Each event stores its original Flightlogger `warning` text in a frozen `importedWarning` field. The visible `warning` is user-editable; the import dedup key is `(tailNumber, importedWarning)`.
- This means renaming an event title (e.g. *"Next inspection (Date/flighthours/Landings)"* → *"100 Hour Inspection"*) does not break dedup or cause duplicates on re-import.
- The `importedWarning` field is hidden from the UI — it's set automatically on import and used internally.
- Manual events have `importedWarning: null` (they have no Flightlogger identity); the dedup falls back to the visible `warning` for those, but only as a safety net since manual events are not expected to collide with Flightlogger rows.
- A one-time backfill runs at the start of the first import after this feature shipped, populating `importedWarning` from `warning` for legacy events. Idempotent — silent no-op on subsequent runs.