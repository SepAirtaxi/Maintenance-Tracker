import {
  Timestamp,
  WriteBatch,
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normaliseTailNumber } from "@/lib/tails";
import { getCurrentUserCtx } from "@/lib/currentUser";
import { parseDurationToMinutes } from "@/lib/time";

export type AuditAction = "create" | "update" | "delete";
export type AuditEntity =
  | "aircraft"
  | "ttaf"
  | "booking"
  | "note"
  | "event"
  | "defect"
  | "statement";

export type AuditLogEntry = {
  id: string;
  at: Timestamp;
  byUid: string;
  byInitials: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  summary: string;
  // TTAF readings only: the aircraft's TTAF (integer minutes) right after
  // this entry, and where it came from. Absent on entries written before
  // 2026-10-23 — those carry the value only inside `summary`.
  ttafMinutes?: number;
  ttafSource?: TtafSource | null;
};

export type TtafSource = "flightlogger" | "manual";

export type AuditPayload = {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary: string;
  ttafMinutes?: number;
  ttafSource?: TtafSource;
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
    ...(payload.ttafMinutes != null
      ? {
          ttafMinutes: payload.ttafMinutes,
          ttafSource: payload.ttafSource ?? null,
        }
      : {}),
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

// ─── TTAF history ─────────────────────────────────────────────────────────
// Dated TTAF readings for the "pick from history" picker in the close-event
// and defect dialogs, newest first. Sourced from the audit log: entries
// written since 2026-10-23 carry `ttafMinutes`; older ones are read back from
// the summary text ("TTAF: 1234:10 → 1238:45 (source: flightlogger)").
// Landings-only entries share the "ttaf" entity and are skipped.
//
// Flightlogger syncs on the first app load of the day, so a reading dated
// Wednesday is usually the TTAF *before* Wednesday's flying.
export type TtafReading = {
  id: string;
  at: Date;
  minutes: number;
  source: TtafSource | null;
};

const SUMMARY_AFTER_RE = /^TTAF: \S+ → (\d+:\d{2})/;
const SUMMARY_UNCHANGED_RE = /^TTAF: (\d+:\d{2}) \(unchanged\)/;

function readingFromEntry(
  id: string,
  data: Omit<AuditLogEntry, "id">,
): TtafReading | null {
  if (data.entity !== "ttaf" || !data.at) return null;
  let minutes = data.ttafMinutes ?? null;
  let source = data.ttafSource ?? null;
  if (minutes == null) {
    const m =
      data.summary.match(SUMMARY_AFTER_RE) ??
      data.summary.match(SUMMARY_UNCHANGED_RE);
    minutes = m ? parseDurationToMinutes(m[1]) : null;
    source = data.summary.includes("source: flightlogger")
      ? "flightlogger"
      : data.summary.includes("source: manual")
        ? "manual"
        : null;
  }
  if (minutes == null) return null;
  return { id, at: data.at.toDate(), minutes, source };
}

export async function fetchTtafReadings(
  tailNumber: string,
  days = 30,
): Promise<TtafReading[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  // Range + order on the same field — no composite index needed. The entity
  // filter runs client-side; 30 days of one aircraft's log is small.
  const snap = await getDocs(
    query(
      auditCol(tailNumber),
      where("at", ">=", Timestamp.fromDate(cutoff)),
      orderBy("at", "desc"),
    ),
  );
  const out: TtafReading[] = [];
  for (const d of snap.docs) {
    const r = readingFromEntry(d.id, d.data() as Omit<AuditLogEntry, "id">);
    if (r) out.push(r);
  }
  return out;
}
