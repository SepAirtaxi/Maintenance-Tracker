import {
  Timestamp,
  WriteBatch,
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normaliseTailNumber } from "@/lib/tails";
import { getCurrentUserCtx } from "@/lib/currentUser";

export type AuditAction = "create" | "update" | "delete";
export type AuditEntity =
  | "aircraft"
  | "ttaf"
  | "booking"
  | "event"
  | "defect";

export type AuditLogEntry = {
  id: string;
  at: Timestamp;
  byUid: string;
  byInitials: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  summary: string;
};

export type AuditPayload = {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary: string;
};

function auditCol(tailNumber: string) {
  return collection(db, "aircraft", normaliseTailNumber(tailNumber), "auditLog");
}

export function logAudit(
  tailNumber: string,
  payload: AuditPayload,
  batch?: WriteBatch,
): void {
  const user = getCurrentUserCtx();
  if (!user) {
    // Surface loudly in dev; silently skip in prod to avoid throwing in
    // response to every mutation when auth is still initialising.
    if (import.meta.env.DEV) {
      console.warn("logAudit called without a signed-in user", payload);
    }
    return;
  }
  const data = {
    at: serverTimestamp(),
    byUid: user.uid,
    byInitials: user.initials,
    action: payload.action,
    entity: payload.entity,
    entityId: payload.entityId ?? null,
    summary: payload.summary,
  };
  if (batch) {
    const ref = doc(auditCol(tailNumber));
    batch.set(ref, data);
  } else {
    void addDoc(auditCol(tailNumber), data);
  }
}

export function subscribeAuditLog(
  tailNumber: string,
  callback: (entries: AuditLogEntry[]) => void,
  opts: { limit?: number } = {},
): () => void {
  const q = query(
    auditCol(tailNumber),
    orderBy("at", "desc"),
    limit(opts.limit ?? 200),
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuditLogEntry, "id">),
      })),
    );
  });
}
