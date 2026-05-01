1: ✅ Planned status on events/defects in overview: differentiated between "No action taken" / "WO created" / "WO + booked" — the third state lights up when a calendar booking links the event/defect (and a WO is set).
2: ✅ Week numbers added — week-view header gets a "· W19" suffix, month view shows the week-range, and Mondays in the grid are tagged with W#.
3: (cancelled, ignored)
4: ✅ Requisition numbers added to events and defects. Inline-editable cell next to WO; new column in event/defect grids and a field in both form dialogs. Audit logged. Purely informational — doesn't drive status.
5: ✅ Header is now sticky (sticky top-0 z-40 in Layout.tsx).
6: ✅ Booking pill on the overview now opens the same BookingViewDialog used on the calendar page (with edit promotion).
7: ✅ Aircraft module → Settings with Aircraft and Locations tabs. New `locations` Firestore collection (CRUD, hangar/external kind, active flag, notes). Booking dialog has a Location selector; the location chip shows on the calendar block, the overview booking pill, and the booking view dialog. Old /aircraft URL redirects to /settings.
