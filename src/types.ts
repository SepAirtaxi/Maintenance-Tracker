import { Timestamp } from "firebase/firestore";

export type UserProfile = {
  uid: string;
  email: string;
  initials: string;
  displayName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type GroundingCauseType = "defect" | "event" | "other";

// The three operational states an aircraft can be in. Derived from the stored
// fields (never stored directly) via `getAircraftStatus` in
// `lib/aircraftStatus.ts`:
//   • "airworthy"        — in service, flying (airworthy !== false).
//   • "grounded"         — AOG / unserviceable, urgent (airworthy === false,
//                          outOfProduction falsy). Carries a grounding cause.
//   • "out-of-production" — deliberately parked and outside the operational
//                          cycle for non-urgent reasons (not yet enrolled,
//                          pending legal work, long-term storage). Not alarming.
export type AircraftStatus = "airworthy" | "grounded" | "out-of-production";

export type Aircraft = {
  tailNumber: string;
  model: string;
  // Defaults to true. Existing docs predating the field are treated as
  // airworthy at read-time via `airworthy !== false`. Both a grounding and an
  // out-of-production status set this to `false`; `outOfProduction` is what
  // distinguishes the two. Prefer `getAircraftStatus` over reading this raw.
  airworthy?: boolean;
  // Out-of-production flag. When true the aircraft is parked outside the
  // operational cycle (see AircraftStatus) — `airworthy` is also false, but the
  // UI treats it as neutral rather than an urgent grounding. Absent/false =
  // not out of production. The three `outOfProduction*` fields are set together
  // and cleared together when the aircraft returns to service.
  outOfProduction?: boolean;
  outOfProductionReason?: string | null;
  outOfProductionAt?: Timestamp | null;
  outOfProductionBy?: string | null;
  totalTimeMinutes: number | null;
  // Snapshot of `totalTimeMinutes` from the previous write — used to render
  // the "Last flight: HH:MM" delta on the overview. Null until at least one
  // TTAF change has been recorded against an existing value.
  previousTotalTimeMinutes?: number | null;
  totalTimeUpdatedAt: Timestamp | null;
  totalTimeUpdatedBy: string | null;
  // `"flightlogger"` = auto-pulled from the Flightlogger API; `"manual"` =
  // edited via the TTAF dialog. The literal `"import"` still appears on legacy
  // docs that pre-date the Flightlogger sync (from the now-removed CSV path) —
  // tolerated on read but no longer written.
  totalTimeSource: "flightlogger" | "manual" | "import" | null;
  // Opt-out switch for the Flightlogger sync (both TTAF and landings).
  // Default behavior is to sync (treat absent/undefined as `true`). Aircraft
  // whose TTAF/landings are managed outside of Flightlogger — typically the
  // PC-12 / King Air turboprops — get this set to `false` from the settings
  // page so the sync ignores them. Name predates the landings field; kept as
  // `syncTtafFromFlightlogger` to avoid a migration.
  syncTtafFromFlightlogger?: boolean;
  // All-time accumulated landings, pulled from Flightlogger alongside TTAF.
  // Integer count. Same monotonic-increase rule as TTAF (never decreases on
  // sync). Null until the first successful sync, or for aircraft excluded
  // from the sync that have no manual landings flow. Audit history for
  // landings rides on the TTAF audit entry — a single "sync occurred" line
  // covers both deltas.
  totalLandings?: number | null;
  // Per-aircraft utilization rate in flight hours per month. Consumed by the
  // Forecast module to convert calendar deadlines into hour deadlines. Null =
  // use the module's default constant. Editing UI is deferred (see
  // forecast_project/PLAN.md "Open items").
  utilizationHoursPerMonth?: number | null;
  // Free-text remark shown in the aircraft header. Used for context that
  // doesn't belong on a specific event/defect (e.g. "grounded — waiting on
  // spare part"). Null/absent when no note is set.
  note?: string | null;
  // Grounding cause. Set when the aircraft is grounded, cleared when lifted.
  // - `defect`/`event`: `groundingCauseId` is the linked Defect/MaintenanceEvent id.
  //   Resolving that item auto-lifts the grounding.
  // - `other`: `groundingReason` carries free text; only manual ungrounding lifts it.
  groundingCauseType?: GroundingCauseType | null;
  groundingCauseId?: string | null;
  groundingReason?: string | null;
  groundedAt?: Timestamp | null;
  groundedBy?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type BookingItemResolutionKind = "resolved" | "deferred" | "nff";

// Frozen snapshot of how a linked event/defect was closed/deferred relative
// to a specific booking. Captured when the entity transitions while the
// booking has already started, so the historical booking dialog can show how
// it actually closed even if the entity is later re-resolved on a different
// WO. Absent for bookings that pre-date this feature or for items that
// haven't transitioned yet.
export type BookingItemResolution = {
  kind: BookingItemResolutionKind;
  // For resolved/nff: the WO the work was logged on. For deferred: null.
  workOrder: string | null;
  // resolvedDate for resolved/nff, deferredAt for deferred.
  date: Timestamp;
  // Defer reason for deferred items.
  reason: string | null;
  // Frozen entity label at the moment of transition — stable if the entity
  // is later renamed.
  label: string;
  itemKind: "event" | "defect";
};

export type Booking = {
  id: string;
  tailNumber: string;
  from: Timestamp;
  // `to: null` = open-ended booking (release date unknown).
  to: Timestamp | null;
  // Optional links to maintenance events on the same tail. Multi-select so a
  // single hangar slot can cover several WOs (e.g. inspection WO + a separate
  // defects WO during the same visit). WO# and event names are derived from
  // the linked events at render time, not stored here. Legacy docs may have a
  // single `eventId: string` field instead — normalized to this array on read.
  eventIds: string[];
  // Optional links to defects on the same tail. Same render-time-derivation
  // pattern as `eventIds`.
  defectIds: string[];
  // Optional location/hangar assignment — managed via Settings → Locations.
  // Render time looks the doc up by id; the label can change over time.
  locationId: string | null;
  // Free-text notes for the booking — shown after the event name on the
  // calendar block, or on hover when space is tight.
  notes: string | null;
  // Per-linked-item resolution snapshot, keyed by eventId or defectId. Future
  // bookings stay live-linked (no snapshot). Bookings that pre-date the
  // feature have this field absent and fall back to live entity state.
  itemResolutions?: Record<string, BookingItemResolution>;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type LocationKind = "hangar" | "external";

export type Location = {
  id: string;
  name: string;
  // "hangar" = own hangar/maintenance bay, "external" = sub-contractor / out
  // of house. Only used for grouping/icon hints in the UI.
  kind: LocationKind;
  notes: string | null;
  // Inactive locations are hidden from new-booking selection but kept so old
  // bookings still resolve to their original label.
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type EventStatus = "unplanned" | "planned";
export type EventSource = "import" | "manual";

export type MaintenanceEvent = {
  id: string;
  tailNumber: string;
  warning: string;
  // Frozen on first import: the original Flightlogger warning text. Used as
  // the dedup key on subsequent imports so that user-edits to `warning` don't
  // cause duplicate events to be created. Null for manually-created events
  // and for legacy import-sourced events that pre-date the field.
  importedWarning: string | null;
  expiryDate: Timestamp | null;
  timerExpiryTimeMinutes: number | null;
  workOrderNumber: string | null;
  // Logistics-only requisition number. Purely informational — does not affect
  // status, calendar bookings, or any computed state.
  requisitionNumber: string | null;
  status: EventStatus;
  source: EventSource;
  // CAMO-granted extension on top of `timerExpiryTimeMinutes`. Stored in
  // minutes so we can stay base-60 throughout. Capped at 5h (300 min) per
  // interval — see `services/events.ts#extendEvent`. Null = no extension.
  // The original due time is never mutated; render time adds these together.
  extensionMinutes: number | null;
  // Planner estimate. `estimated` = the planner has reviewed this item;
  // `estimatedManHours` = work-time guess (man-hours, NOT flight hours).
  // The two are independent so an item can be reviewed without committing to
  // a number yet. Phase 1 lives on the event itself; phase 2 may lift these
  // onto a WorkOrder collection (names port directly).
  estimated: boolean;
  estimatedManHours: number | null;
  // Link to the scheduled-event template this event was created from. Null
  // for free-text events and for events that pre-date templates. Stored as an
  // ID (not title text) so renaming a template doesn't silently break the
  // missing-events check. The title (`warning`) is editable independently
  // after creation — the link is what counts.
  templateId: string | null;
  // Resolution metadata. Resolved events stay in Firestore as legacy; the
  // overview filters them out. All four resolution fields are set together.
  resolvedDate: Timestamp | null;
  resolutionWorkOrder: string | null;
  // TTAF at which the event was actually carried out, captured from the
  // mechanic's work pack at close time. Manual entry — optional, not
  // back-fillable for events closed before this field shipped. Surfaced in
  // the Missing → Events "last completed" hint and the history dialog so
  // SEP can see when each templated inspection last happened in TTAF terms.
  resolutionTtafMinutes: number | null;
  // Free-text note captured at close time. Used for administrative closes that
  // need a stated reason — e.g. the bulk "Wiped due to stale data" cleanup.
  // Null for events closed through the normal WO flow. Surfaced in the history
  // dialog alongside the other resolution metadata.
  resolutionNote: string | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Defect = {
  id: string;
  tailNumber: string;
  title: string;
  reportedDate: Timestamp;
  reportedTtafMinutes: number;
  workOrderNumber: string | null;
  // Logistics-only requisition number. Purely informational — does not affect
  // status, calendar bookings, or any computed state.
  requisitionNumber: string | null;
  // Resolution metadata. Resolved defects stay in Firestore as legacy; the
  // overview filters them out. All resolution fields are set together.
  // `resolutionKind` distinguishes a true fix from a "no fault found" closure;
  // null while the defect is open.
  resolvedDate: Timestamp | null;
  resolutionWorkOrder: string | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  resolutionKind: "fixed" | "nff" | null;
  // IDs of prior defects on the same tail that this defect is reported as a
  // recurrence of. Unidirectional (new → old). Empty array when none. Titles
  // are resolved at render time, dangling refs tolerated.
  relatedDefectIds: string[];
  // Deferral state. CAMO policy: a deferred defect must be reviewed within
  // 30 days of `deferredAt`; re-deferring overwrites these fields with the
  // new timestamp/reason (the audit log keeps the chain). Null when active.
  deferredAt: Timestamp | null;
  deferralReason: string | null;
  deferredBy: string | null;
  // Planner estimate — see `MaintenanceEvent.estimated` for semantics.
  estimated: boolean;
  estimatedManHours: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

// Recurring scheduled-event template (e.g. "50 Hour Inspection",
// "100 Hour Inspection", PC-12 phase inspections). Events created from a
// template carry its `id` in `MaintenanceEvent.templateId`. The template's
// `tailNumbers` list is the CAMO's per-template applicability — used by the
// missing-events check to flag aircraft that should have an open event for
// this template but don't. Inactive templates stop appearing in pickers and
// stop flagging missing, but stay in Firestore so legacy events keep their
// link.
export type EventTemplate = {
  id: string;
  title: string;
  tailNumbers: string[];
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type NotificationType =
  | "auto-grounded"
  | "deferral-overdue"
  | "booking-reminder";

// Persistent banner notification. Global ack — once anyone dismisses it, the
// banner disappears for everyone. View-only users never see banners and never
// read or write this collection. Doc id is deterministic: `${type}__${tail}__
// ${causeId}` so re-raising for the same cause is a no-op (setDoc + merge).
export type Notification = {
  id: string;
  type: NotificationType;
  tailNumber: string;
  // For `auto-grounded` this is the eventId; for `deferral-overdue` it's the
  // defectId; both are null for `booking-reminder` (the tail is the cause).
  eventId: string | null;
  defectId: string | null;
  // Frozen message text captured when the notification was raised, so the
  // banner reads the same even if the linked entity is later renamed.
  message: string;
  createdAt: Timestamp;
  // Global ack — non-null = dismissed by `acknowledgedBy`.
  acknowledgedAt: Timestamp | null;
  acknowledgedBy: string | null;
};
