Copenhagen AirTaxi Maintenance Tracker:


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


---

## Implementation notes (additions beyond the original spec)

### Defects — resolution flow
- Defects can be **resolved**, in addition to edited/deleted. Resolving prompts for a work-order number and resolution date, then marks the defect as legacy.
- Resolved defects are kept in Firestore (`resolvedDate`, `resolutionWorkOrder`, `resolvedAt`, `resolvedBy` fields) but filtered out of the active overview.
- The audit log captures the resolution with WO number and date.

### Aircraft header — two-row layout
- **Row 1:** tail number, model, airworthy/grounded toggle, in-maintenance badge, defect badge, "Updated <date>" (latest aircraft-doc `updatedAt`), and Event/Defect/Log action buttons.
- **Row 2:** TTAF and Booked maintenance as two equal-width cells with fixed-column grid layouts so values, meta date/source, and the edit pencil sit at predictable positions regardless of content width.
- "Updated <date>" reflects any change to the aircraft document — TTAF, booking, model change, airworthiness toggle.

### Upcoming events dialog
- Top-level **Upcoming events** button on the overview, next to **Import flight data**.
- Opens a popup with the 25 nearest events by date and 25 nearest by hours, fleet-wide. Severity-tinted (red/yellow/green) using the same thresholds as the per-aircraft rows.

### Event identity (import dedup)
- Each event stores its original Flightlogger `warning` text in a frozen `importedWarning` field. The visible `warning` is user-editable; the import dedup key is `(tailNumber, importedWarning)`.
- This means renaming an event title (e.g. *"Next inspection (Date/flighthours/Landings)"* → *"100 Hour Inspection"*) does not break dedup or cause duplicates on re-import.
- The `importedWarning` field is hidden from the UI — it's set automatically on import and used internally.
- Manual events have `importedWarning: null` (they have no Flightlogger identity); the dedup falls back to the visible `warning` for those, but only as a safety net since manual events are not expected to collide with Flightlogger rows.
- A one-time backfill runs at the start of the first import after this feature shipped, populating `importedWarning` from `warning` for legacy events. Idempotent — silent no-op on subsequent runs.