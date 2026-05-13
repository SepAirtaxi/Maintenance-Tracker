# Overview Todo — Round 3 Plan

Handoff doc for the next session. Round 1 (4 items, 2026-05-08) and Round 2 (grounding cause + TTAF delta, 2026-05-13) shipped — this is Round 3.

Source: `todo.md` (4 items).

---

## Decisions (locked in with SEP)

1. **Notification acks are GLOBAL, not per-user.** SEP (CAMO) is effectively the single responsible user; once anyone authenticated dismisses, it's dismissed for everyone. View-only users never see banners.
2. **Detection is CLIENT-SIDE only.** No Cloud Functions. The app is opened continuously throughout the workday, so client-side detection on overview/page load is sufficient. The grounded state persists in Firestore, so even if user A grounds without seeing the banner, user B sees the grounded card immediately and the banner if not yet acked.
3. **No legacy backfill for Item 3.** The app has been live <2 weeks. Start snapshotting from now on; pre-existing bookings keep falling back to live entity state.
4. **Banner UI is custom, not a toast library.** These need to persist until acknowledged — `sonner` / `react-hot-toast` are wrong primitives. Build a custom sticky banner stack at the top of every page.

---

## Order of Work (recommended)

1. **Item 4** — overview WO grouping. Smallest, isolated. Ship first.
2. **Item 1a** — auto-ground-on-expiry service logic (no UI yet).
3. **Item 1b** — notification banner infrastructure (`notifications` Firestore collection + banner component + ack flow). Stylistically: SEVERE (red) for auto-grounding.
4. **Item 2** — reuse banner infra; new notification type `deferral-overdue`. Stylistically: GENTLE (blue/amber, "kind reminder" tone). Important — don't reuse the red severity styling from item 1.
5. **Item 3** — booking resolution snapshotting (independent — can interleave with 2 if convenient).

---

## Item 1 — Auto-ground on expired events + acknowledged banner

### What's already in place

- `Aircraft` has `airworthy`, `groundingCauseType`, `groundingCauseId`, `groundingReason`, `groundedAt`, `groundedBy` (see `src/types.ts:14-48`).
- `groundAircraft(tail, { type: "event", eventId }, byUid)` exists in `src/services/aircraft.ts:112` — idempotent enough; safe to call when already grounded with the same cause.
- Expiry detection: `severity === "red"` from `getEventSeverity()` in `src/lib/eventStatus.ts:69`. Red means `daysLeft < 0` OR `minutesLeft < 0` (with `extensionMinutes` factored in via `getEffectiveTimerExpiryMinutes`).
- Anonymous auth flag is `isViewer = user.isAnonymous` in `src/context/AuthContext.tsx:72`. Banners hidden when `isViewer === true`.

### Auto-ground service logic

Add to `src/services/aircraft.ts` (or a new `src/services/grounding.ts` if it gets big):

```ts
// Walks aircraft + events, grounds any airworthy aircraft that has at least
// one event past its effective expiry (date or hours).
// Idempotent — skips aircraft that are already grounded.
// Returns the list of (tail, event) pairs it grounded so the caller can
// raise notifications.
export async function autoGroundExpired(
  byUid: string,
  // Already-loaded snapshots from OverviewPage; pass them in to avoid re-reading
  aircraft: Aircraft[],
  events: MaintenanceEvent[],
): Promise<{ tail: string; event: MaintenanceEvent }[]>
```

For each airworthy aircraft, find its events; pick the first (by earliest expiry) where `severity === "red"`; call `groundAircraft(tail, { type: "event", eventId: e.id }, byUid)`. Collect for caller.

**Where to invoke it:** `OverviewPage.tsx` `useEffect` keyed on `[aircraft, events]` after they load. Debounce-protect with a `processing` ref so re-renders don't fire duplicate writes. Skip when `isViewer`.

### Notification data model

New collection `notifications`:

```ts
type Notification = {
  id: string;
  type: "auto-grounded" | "deferral-overdue";
  tail: string;
  // Exactly one of eventId / defectId set, depending on type.
  eventId: string | null;
  defectId: string | null;
  // Frozen snapshot of the title/description for stable rendering even if
  // the linked entity is later edited.
  message: string;
  createdAt: Timestamp;
  // Global ack — once set, banner disappears for everyone.
  acknowledgedAt: Timestamp | null;
  acknowledgedBy: string | null; // uid
};
```

**Doc id strategy:** Deterministic — `${type}__${tail}__${eventId|defectId}`. Lets us use `setDoc` with merge-create-if-missing without race conditions. If the notification was previously acked and a *new* expiry event happens (unlikely for the same eventId; common for `deferral-overdue` after re-deferral), delete the old doc when the condition clears so a new one can be raised.

**Lifecycle:**

- *Create* when auto-ground succeeds (item 1) or `getDeferralStatus() === "overdue"` and no unacked notification exists (item 2).
- *Ack* (manual, user dismisses banner): set `acknowledgedAt` + `acknowledgedBy`. Doc stays in Firestore as an audit trail.
- *Delete* when the underlying condition clears (event resolved → delete the `auto-grounded` notification; defect resolved or re-deferred → delete the `deferral-overdue` notification). This is so the same defect can raise a fresh notification next 30-day cycle.

### Banner UI

New file `src/components/notifications/NotificationBanner.tsx` (and a `NotificationBannerStack.tsx` if multiple). Render in `Layout.tsx` so it appears on every page.

- Subscribe to `notifications` collection via `onSnapshot`, filtered `where("acknowledgedAt", "==", null)`.
- Hide entirely when `isViewer`.
- One banner per notification, stacked top of viewport (below header, above page content).
- "Dismiss" button writes `acknowledgedAt`/`acknowledgedBy`.

**Visual differentiation** (per SEP's instruction):

- `auto-grounded` → SEVERE: red background, `ShieldOff` icon, message like *"AC OY-XXX grounded — event 'X' expired on YYYY-MM-DD"*.
- `deferral-overdue` → GENTLE: blue or amber tinted, smaller, info-icon, message like *"CAMO reminder: deferred defect 'X' on OY-XXX needs review (deferred YYYY-MM-DD, 30+ days)"*. Wording should read as a kind nudge, not an alarm.

### Tying auto-lift to notification cleanup

`liftGrounding()` in `src/services/aircraft.ts:164` already gets called when a linked defect/event resolves (see `findAircraftGroundedByCause` flow). Plumb notification deletion into that path — when an event resolves, also delete any `notifications` doc with `type: "auto-grounded"` and that eventId.

---

## Item 2 — 30-day deferral notification

Reuses everything from Item 1. Just adds:

- A pass in the same client-side check (`useEffect` on overview load) that iterates active defects, calls `getDeferralStatus(d)` (already exists in `src/lib/eventStatus.ts:121`), and creates `notifications` docs for any that returned `"overdue"` without an existing unacked doc.
- Cleanup hooks in `resolveDefect` and `deferDefect` (re-deferral with new `deferredAt`) — delete the corresponding `deferral-overdue` notification so a fresh one can raise after the next 30-day window.
- Styled GENTLY (see Item 1 banner spec).

---

## Item 3 — Resolution snapshot on bookings

### The problem (recap)

`BookingViewDialog` in `src/components/calendar/BookingViewDialog.tsx` shows striked-through items via `it.resolved = !!entity.resolvedAt`, computed from the LIVE entity via `buildBookingGroups` in `src/lib/bookingDisplay.ts:23`. So if a defect was deferred during a January booking, then later resolved on a March WO, the January booking dialog misleadingly shows the March resolution data.

### Schema change

Add to `Booking` in `src/types.ts:50`:

```ts
// Per-linked-item resolution snapshot. Frozen at the moment the linked
// event/defect transitions to resolved/deferred/NFF while this booking has
// already started (booking.from <= now). Lets historic bookings show how
// they actually closed, even if the linked entity is later re-resolved on
// a different WO. Absent for bookings that pre-date this feature.
itemResolutions?: Record<string, BookingItemResolution>;
```

```ts
export type BookingItemResolutionKind =
  | "resolved"      // event closed, or defect resolved with kind === "fixed"
  | "deferred"      // defect deferred
  | "nff";          // defect resolved with kind === "nff"

export type BookingItemResolution = {
  kind: BookingItemResolutionKind;
  workOrder: string | null;       // resolutionWorkOrder for resolved/nff
  date: Timestamp;                 // resolvedDate or deferredAt
  reason?: string | null;          // deferralReason for deferred
  // Frozen label for stability if entity is later renamed
  label: string;
  itemKind: "event" | "defect";
};
```

Key is the entity id (eventId or defectId).

### Snapshot-on-transition logic

In each of these service functions, after the resolve/defer write succeeds:

- `resolveEvent` in `src/services/events.ts`
- `resolveDefect` in `src/services/defects.ts`
- `deferDefect` in `src/services/defects.ts`

…query bookings for that tail where the entity is linked AND `booking.from <= now` AND `booking.itemResolutions[entityId]` is not already set. For each match, write the snapshot.

Bookings entirely in the future stay live-linked — they reflect current state, which is what's wanted when an aircraft is later booked for rectification.

### Render-time consumption

Update `BookingViewDialog` (and any other booking display — `CalendarGrid` tooltip rendering also calls `buildBookingGroups`):

- Prefer `booking.itemResolutions[itemId]` if present.
- Render a small badge next to the item: `resolved · WO 1234` / `deferred` / `NFF`.
- Fall back to live entity state otherwise (legacy bookings).

Likely cleanest: extend `BookingItem` in `src/lib/bookingDisplay.ts:5` with a `resolution?: BookingItemResolution` field and let `buildBookingGroups` read from `itemResolutions` when available, else derive from the live entity as today.

### Legacy data

Per SEP: no backfill. Pre-existing bookings continue using live fallback. Acceptable since the app has been live <2 weeks.

---

## Item 4 — Group overview events by shared WO

### Current behavior

`sortEvents` in `src/pages/OverviewPage.tsx:66`:

```ts
sort by severity (red first), then by expiryDate ascending
```

### New behavior

Group by `workOrderNumber` (events without a WO# = singleton groups), then sort groups by worst severity within the group, then by earliest expiry. Within a group: severity then expiry.

```ts
function sortEvents(events, currentTtafMinutes) {
  // 1. group by WO#, singleton for null/blank WO#
  // 2. compute per-group: worstSev, earliestExpiryMillis
  // 3. sort groups by (severityRank desc, earliestExpiry asc)
  // 4. within each group, sort by (severityRank desc, expiry asc)
  // 5. flatten
}
```

This preserves Round 1/Round 2 behavior for non-shared-WO events (they're each in singleton groups) while co-locating shared-WO events.

**Note:** Consider whether to add a subtle visual cue (e.g. tiny left-border tint connecting rows sharing a WO) in `EventRow`. Probably not in v1 — just the proximity is enough. Confirm with SEP if there's appetite for the visual cue.

---

## Files likely to touch

- `src/types.ts` — add `Notification` type, `BookingItemResolution`, extend `Booking`.
- `src/services/aircraft.ts` — `autoGroundExpired()`, notification cleanup hook in `liftGrounding`.
- `src/services/events.ts` — booking snapshot hook in `resolveEvent`; notification cleanup.
- `src/services/defects.ts` — booking snapshot hook in `resolveDefect` and `deferDefect`; notification cleanup.
- **New** `src/services/notifications.ts` — CRUD + ack for `notifications` collection.
- **New** `src/components/notifications/NotificationBanner.tsx` (and stack).
- `src/components/Layout.tsx` — mount notification stack.
- `src/lib/bookingDisplay.ts` — read from `itemResolutions` when present.
- `src/components/calendar/BookingViewDialog.tsx` — render resolution badges.
- `src/components/calendar/CalendarGrid.tsx` — same, if tooltips show resolution.
- `src/pages/OverviewPage.tsx` — new `sortEvents` (Item 4); `useEffect` for auto-ground + deferral notification raise (Items 1+2).

---

## Open questions for next session

- None blocking. SEP has decided on global ack, client-side detection, no legacy backfill, custom banner.
- Optional polish: should the auto-ground banner offer a one-click "ungrund" action for the case where the event has been resolved in another tool but the resolve action wasn't yet logged here? Probably no — would short-circuit the audit trail. Default: dismiss-only.
- Optional polish: should resolved/deferred events that already exist *before* feature-ship date get snapshots written via a one-shot migration on first overview load? Per SEP: no. Skipping.
