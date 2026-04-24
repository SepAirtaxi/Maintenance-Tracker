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
  totalTimeMinutes: number | null;
  totalTimeUpdatedAt: Timestamp | null;
  totalTimeUpdatedBy: string | null;
  totalTimeSource: "import" | "manual" | null;
  nextBookedMaintenance: {
    from: Timestamp;
    to: Timestamp;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
