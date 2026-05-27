import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normaliseTailNumber } from "@/lib/tails";
import { formatMinutesAsDuration } from "@/lib/time";
import { logAudit } from "@/services/audit";
import type { Aircraft } from "@/types";

// Browser-side Flightlogger TTAF sync.
//
// The actual API call lives behind `/api/flightlogger-sync` (a Vercel Edge
// function) so the API token never reaches the browser. This module:
//   1. Fetches the proxied result
//   2. Maps Flightlogger callSigns onto our fleet's tail numbers
//   3. Applies the same monotonic-increase rule the CSV import used
//   4. Batch-writes per-aircraft TTAF + an audit entry + a single meta doc
//   5. Reports a structured summary back to the caller

export type FlightloggerAircraftPayload = {
  callSign: string;
  totalAirborneMinutes: number | null;
  totalLandings: number | null;
};

export type FlightloggerSyncResponse = {
  aircraft: FlightloggerAircraftPayload[];
  fetchedAt: string;
};

export type SyncStatus = "success" | "failed";

export type FlightloggerSyncMeta = {
  lastRunAt: Timestamp | null;
  lastSuccessAt: Timestamp | null;
  lastStatus: SyncStatus | null;
  lastSummary: string | null;
  lastError: string | null;
};

export type SyncResult = {
  status: SyncStatus;
  summary: string;
  updated: Array<{ tailNumber: string; before: number | null; after: number }>;
  skippedStale: Array<{
    tailNumber: string;
    candidate: number;
    stored: number;
  }>;
  skippedUnchanged: string[]; // candidate === stored
  excluded: string[]; // aircraft with syncTtafFromFlightlogger === false
  error?: string;
};

const META_DOC_PATH = ["meta", "flightloggerSync"] as const;
const metaDocRef = () => doc(db, META_DOC_PATH[0], META_DOC_PATH[1]);

export async function getSyncMeta(): Promise<FlightloggerSyncMeta | null> {
  const snap = await getDoc(metaDocRef());
  if (!snap.exists()) return null;
  return snap.data() as FlightloggerSyncMeta;
}

export function subscribeSyncMeta(
  callback: (meta: FlightloggerSyncMeta | null) => void,
): () => void {
  return onSnapshot(
    metaDocRef(),
    (snap) => {
      callback(snap.exists() ? (snap.data() as FlightloggerSyncMeta) : null);
    },
    // Without an error handler, a permission/network failure silently kills
    // the listener and the indicator never loads. Emitting null on error
    // lets the caller mark the indicator as "loaded with no data" so the
    // user sees a "not yet synced" state instead of an empty header.
    (err) => {
      console.error("Flightlogger sync meta subscription failed", err);
      callback(null);
    },
  );
}

// Calendar-day comparison in Europe/Copenhagen. `lastSuccessAt` being on a
// previous CPH date (or absent) means the auto-sync should fire on app open.
// `sv-SE` locale formats as YYYY-MM-DD which compares lexicographically.
function cphDateString(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isStaleForToday(meta: FlightloggerSyncMeta | null): boolean {
  if (!meta?.lastSuccessAt) return true;
  return (
    cphDateString(meta.lastSuccessAt.toDate()) !== cphDateString(new Date())
  );
}

async function fetchFromProxy(): Promise<FlightloggerSyncResponse> {
  const response = await fetch("/api/flightlogger-sync", {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      `Sync endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  return (await response.json()) as FlightloggerSyncResponse;
}

async function fetchFleetByTail(): Promise<Map<string, Aircraft>> {
  const snap = await getDocs(collection(db, "aircraft"));
  const map = new Map<string, Aircraft>();
  snap.forEach((d) => map.set(d.id, d.data() as Aircraft));
  return map;
}

function describeSummary(result: SyncResult): string {
  if (result.status === "failed") {
    return result.error ?? "Sync failed.";
  }
  const parts: string[] = [];
  parts.push(
    `${result.updated.length} updated, ${result.skippedUnchanged.length} unchanged`,
  );
  if (result.skippedStale.length > 0) {
    // Inline the actual tails so the indicator answers "which ones?" without
    // needing to dig into the audit log. Stale skips are rare and small in
    // count, so the full list comfortably fits in the summary line.
    const tails = result.skippedStale.map((s) => s.tailNumber).join(", ");
    parts.push(`${result.skippedStale.length} stale (${tails})`);
  }
  if (result.excluded.length > 0) {
    parts.push(`${result.excluded.length} excluded`);
  }
  return parts.join(" · ");
}

export async function runFlightloggerSync(byUid: string): Promise<SyncResult> {
  const result: SyncResult = {
    status: "success",
    summary: "",
    updated: [],
    skippedStale: [],
    skippedUnchanged: [],
    excluded: [],
  };

  let payload: FlightloggerSyncResponse;
  try {
    payload = await fetchFromProxy();
  } catch (err) {
    result.status = "failed";
    result.error = err instanceof Error ? err.message : String(err);
    result.summary = describeSummary(result);
    // Still record the attempt so the UI can show "last attempt failed".
    await setDoc(
      metaDocRef(),
      {
        lastRunAt: serverTimestamp(),
        lastStatus: "failed",
        lastSummary: result.summary,
        lastError: result.error,
      },
      { merge: true },
    );
    return result;
  }

  const fleet = await fetchFleetByTail();

  const batch = writeBatch(db);
  let pendingWrites = 0;

  for (const item of payload.aircraft) {
    const tail = normaliseTailNumber(item.callSign);
    if (!tail) continue;

    const aircraft = fleet.get(tail);
    // Silently skip call signs we don't know about — they're outside the
    // scope of this app's fleet and SEP doesn't need them surfaced.
    if (!aircraft) continue;

    // Per-aircraft opt-out: turboprops have TTAF managed outside Flightlogger
    // (the CAMO maintains them in another system). `syncTtafFromFlightlogger`
    // is treated as defaulting to true when undefined, so existing docs stay
    // synced without a migration; only an explicit `false` excludes a tail.
    if (aircraft.syncTtafFromFlightlogger === false) {
      result.excluded.push(tail);
      continue;
    }

    const candidate = item.totalAirborneMinutes;
    if (candidate == null || !Number.isFinite(candidate) || candidate < 0) {
      continue;
    }

    const stored = aircraft.totalTimeMinutes;
    const ttafUnchanged = stored != null && candidate === stored;
    const ttafStale = stored != null && candidate < stored;

    // Landings ride on the same sync. Apply the same monotonic-increase rule
    // as TTAF: never overwrite a higher stored value with a lower API value.
    // Treated as optional — if Flightlogger returns null/garbage we just
    // don't touch landings this round, but TTAF can still update.
    const candidateLandings = item.totalLandings;
    const storedLandings = aircraft.totalLandings ?? null;
    const landingsValid =
      candidateLandings != null &&
      Number.isFinite(candidateLandings) &&
      candidateLandings >= 0;
    const landingsStale =
      landingsValid &&
      storedLandings != null &&
      candidateLandings < storedLandings;
    const landingsShouldWrite =
      landingsValid &&
      !landingsStale &&
      (storedLandings == null || candidateLandings !== storedLandings);

    if (ttafUnchanged && !landingsShouldWrite) {
      result.skippedUnchanged.push(tail);
      continue;
    }
    if (ttafStale && !landingsShouldWrite) {
      result.skippedStale.push({ tailNumber: tail, candidate, stored: stored! });
      continue;
    }

    const ref = doc(db, "aircraft", tail);
    const update: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    let ttafChangedForAudit = false;
    if (!ttafUnchanged && !ttafStale) {
      update.totalTimeMinutes = candidate;
      update.previousTotalTimeMinutes = stored;
      update.totalTimeUpdatedAt = serverTimestamp();
      update.totalTimeUpdatedBy = byUid;
      update.totalTimeSource = "flightlogger";
      ttafChangedForAudit = true;
    }
    if (landingsShouldWrite) {
      update.totalLandings = candidateLandings;
    }
    batch.update(ref, update);

    // Single audit entry covers both deltas. When only landings changed
    // (TTAF unchanged or stale-blocked), the line still reads naturally.
    const ttafPart = ttafChangedForAudit
      ? `TTAF: ${formatMinutesAsDuration(stored)} → ${formatMinutesAsDuration(candidate)}`
      : `TTAF: ${formatMinutesAsDuration(stored)} (unchanged)`;
    const landingsPart = landingsShouldWrite
      ? ` · landings ${storedLandings ?? "—"} → ${candidateLandings}`
      : "";
    logAudit(
      tail,
      {
        action: "update",
        entity: "ttaf",
        summary: `${ttafPart}${landingsPart} (source: flightlogger)`,
      },
      batch,
    );
    // Always record into `updated` when anything was written. For the
    // landings-only backfill case (first sync after this code ships, TTAF
    // already on file, landings about to be filled in for the first time)
    // before/after read as identical TTAF — the audit entry carries the
    // landings story.
    result.updated.push({
      tailNumber: tail,
      before: stored,
      after: ttafChangedForAudit ? candidate : (stored ?? candidate),
    });
    pendingWrites += 2;
  }

  result.summary = describeSummary(result);

  // Single meta-doc write rolled into the same batch keeps the indicator
  // consistent with the underlying TTAF writes. If the batch fails, none of
  // it lands and the UI keeps showing the previous successful sync.
  batch.set(
    metaDocRef(),
    {
      lastRunAt: serverTimestamp(),
      lastSuccessAt: serverTimestamp(),
      lastStatus: "success",
      lastSummary: result.summary,
      lastError: null,
    },
    { merge: true },
  );
  pendingWrites += 1;

  try {
    if (pendingWrites > 0) {
      await batch.commit();
    }
  } catch (err) {
    result.status = "failed";
    result.error = err instanceof Error ? err.message : String(err);
    result.summary = describeSummary(result);
    await setDoc(
      metaDocRef(),
      {
        lastRunAt: serverTimestamp(),
        lastStatus: "failed",
        lastSummary: result.summary,
        lastError: result.error,
      },
      { merge: true },
    );
  }

  return result;
}
