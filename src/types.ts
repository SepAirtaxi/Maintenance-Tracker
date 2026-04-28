import { Timestamp } from "firebase/firestore";

export type UserProfile = {
  uid: string;
  email: string;
  initials: string;
  displayName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Aircraft = {
  tailNumber: string;
  model: string;
  // Defaults to true. Existing docs predating the field are treated as
  // airworthy at read-time via `airworthy !== false`.
  airworthy?: boolean;
  totalTimeMinutes: number | null;
  totalTimeUpdatedAt: Timestamp | null;
  totalTimeUpdatedBy: string | null;
  totalTimeSource: "import" | "manual" | null;
  nextBookedMaintenance: {
    from: Timestamp;
    // `to: null` = open-ended booking (release date unknown).
    to: Timestamp | null;
  } | null;
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
  status: EventStatus;
  source: EventSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Defect = {
  id: string;
  tailNumber: string;
  title: string;
  reportedDate: Timestamp;
  reportedTtafMinutes: number;
  // Resolution metadata. Resolved defects stay in Firestore as legacy; the
  // overview filters them out. All four resolution fields are set together.
  resolvedDate: Timestamp | null;
  resolutionWorkOrder: string | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
