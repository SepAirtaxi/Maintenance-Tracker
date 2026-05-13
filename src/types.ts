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

export type Aircraft = {
  tailNumber: string;
  model: string;
  // Defaults to true. Existing docs predating the field are treated as
  // airworthy at read-time via `airworthy !== false`.
  airworthy?: boolean;
  totalTimeMinutes: number | null;
  // Snapshot of `totalTimeMinutes` from the previous write — used to render
  // the "Last flight: HH:MM" delta on the overview. Null until at least one
  // TTAF change has been recorded against an existing value.
  previousTotalTimeMinutes?: number | null;
  totalTimeUpdatedAt: Timestamp | null;
  totalTimeUpdatedBy: string | null;
  totalTimeSource: "import" | "manual" | null;
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

export type Booking = {
  id: string;
  tailNumber: string;
  from: Timestamp;
  // `to: null` = open-ended booking (release date unknown).
  to: Timestamp | null;
  // Optional link to a maintenance event on the same tail. WO# and event name
  // are derived from the linked event at render time, not stored here.
  eventId: string | null;
  // Optional links to defects on the same tail. Same render-time-derivation
  // pattern as `eventId`.
  defectIds: string[];
  // Optional location/hangar assignment — managed via Settings → Locations.
  // Render time looks the doc up by id; the label can change over time.
  locationId: string | null;
  // Free-text notes for the booking — shown after the event name on the
  // calendar block, or on hover when space is tight.
  notes: string | null;
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
  // Resolution metadata. Resolved events stay in Firestore as legacy; the
  // overview filters them out. All four resolution fields are set together.
  resolvedDate: Timestamp | null;
  resolutionWorkOrder: string | null;
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
