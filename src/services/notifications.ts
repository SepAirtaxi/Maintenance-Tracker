import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Notification, NotificationType } from "@/types";

const notificationsCol = () => collection(db, "notifications");
const notificationDoc = (id: string) => doc(db, "notifications", id);

// Deterministic doc id keyed by type + tail + cause. Lets `setDoc` act as
// "create-if-missing" without races: repeated raise() calls for the same cause
// land on the same doc and the original `createdAt`/ack state is preserved
// because we only write when the doc is missing (see raiseNotification).
function notificationId(
  type: NotificationType,
  tailNumber: string,
  causeId: string,
): string {
  return `${type}__${tailNumber}__${causeId}`;
}

function docToNotification(
  id: string,
  data: Record<string, unknown>,
): Notification {
  return {
    id,
    type: data.type as NotificationType,
    tailNumber: data.tailNumber as string,
    eventId: (data.eventId as string | null) ?? null,
    defectId: (data.defectId as string | null) ?? null,
    message: data.message as string,
    createdAt: data.createdAt as Timestamp,
    acknowledgedAt: (data.acknowledgedAt as Timestamp | null) ?? null,
    acknowledgedBy: (data.acknowledgedBy as string | null) ?? null,
  };
}

// Subscribes to unacked notifications only. The banner stack uses this; the
// query is server-filtered so acked docs don't bloat the snapshot.
export function subscribeActiveNotifications(
  callback: (notifications: Notification[]) => void,
): () => void {
  const q = query(notificationsCol(), where("acknowledgedAt", "==", null));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToNotification(d.id, d.data())));
  });
}

type RaiseInput =
  | {
      type: "auto-grounded";
      tailNumber: string;
      eventId: string;
      message: string;
    }
  | {
      type: "deferral-overdue";
      tailNumber: string;
      defectId: string;
      message: string;
    };

// Creates the notification only if one doesn't already exist for this cause.
// Preserves a previously-acked notification from re-raising on its own — only
// `clearNotification` (called when the cause resolves) allows a fresh raise.
export async function raiseNotification(input: RaiseInput): Promise<void> {
  const causeId = input.type === "auto-grounded" ? input.eventId : input.defectId;
  const id = notificationId(input.type, input.tailNumber, causeId);
  const ref = notificationDoc(id);
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    type: input.type,
    tailNumber: input.tailNumber,
    eventId: input.type === "auto-grounded" ? input.eventId : null,
    defectId: input.type === "deferral-overdue" ? input.defectId : null,
    message: input.message,
    createdAt: serverTimestamp(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  });
}

export async function acknowledgeNotification(
  id: string,
  byUid: string,
): Promise<void> {
  await updateDoc(notificationDoc(id), {
    acknowledgedAt: serverTimestamp(),
    acknowledgedBy: byUid,
  });
}

// Deletes a notification entirely. Used when the underlying cause clears
// (event resolved → drop the auto-grounded notification; defect resolved or
// re-deferred → drop the deferral-overdue notification) so a future occurrence
// can raise a fresh one.
export async function clearNotification(
  type: NotificationType,
  tailNumber: string,
  causeId: string,
): Promise<void> {
  const id = notificationId(type, tailNumber, causeId);
  await deleteDoc(notificationDoc(id));
}
