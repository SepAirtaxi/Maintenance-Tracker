import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normaliseTailNumber } from "@/lib/tails";
import { logAudit } from "@/services/audit";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import {
  findAircraftGroundedByCause,
  liftGrounding,
} from "@/services/aircraft";
import type { Defect } from "@/types";

const defectsCol = () => collection(db, "defects");
const defectDoc = (id: string) => doc(db, "defects", id);

export type DefectInput = {
  tailNumber: string;
  title: string;
  reportedDate: Date;
  reportedTtafMinutes: number;
  workOrderNumber: string | null;
  requisitionNumber: string | null;
  relatedDefectIds?: string[];
};

// Verify each candidate id points to a defect on the given tail. Drops ids
// that don't exist or live on a different tail (defensive — IDs only come
// from the form picker, but stale state can still slip through). Dedupes.
async function filterValidRelatedIds(
  tailNumber: string,
  ids: string[] | undefined,
  excludeId?: string,
): Promise<string[]> {
  if (!ids || ids.length === 0) return [];
  const unique = Array.from(new Set(ids)).filter((id) => id !== excludeId);
  if (unique.length === 0) return [];
  const snaps = await Promise.all(unique.map((id) => getDoc(defectDoc(id))));
  return unique.filter((_id, i) => {
    const s = snaps[i];
    if (!s.exists()) return false;
    const data = s.data() as Record<string, unknown>;
    return (data.tailNumber as string) === tailNumber;
  });
}

function validate(input: DefectInput) {
  if (!input.tailNumber.trim()) throw new Error("Tail number is required.");
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!(input.reportedDate instanceof Date) || isNaN(input.reportedDate.valueOf())) {
    throw new Error("Reported date is required.");
  }
  if (
    !Number.isFinite(input.reportedTtafMinutes) ||
    input.reportedTtafMinutes < 0
  ) {
    throw new Error("Reported TTAF is required.");
  }
}

function docToDefect(id: string, data: Record<string, unknown>): Defect {
  const resolvedAt = (data.resolvedAt as Timestamp | undefined) ?? null;
  const storedKind = data.resolutionKind as
    | "fixed"
    | "nff"
    | null
    | undefined;
  // Legacy default: any pre-existing resolved defect predates the field, so
  // treat it as "fixed". Open defects stay null.
  const resolutionKind: "fixed" | "nff" | null =
    storedKind ?? (resolvedAt ? "fixed" : null);
  return {
    id,
    tailNumber: data.tailNumber as string,
    title: data.title as string,
    reportedDate: data.reportedDate as Timestamp,
    reportedTtafMinutes: data.reportedTtafMinutes as number,
    workOrderNumber: (data.workOrderNumber as string | undefined) ?? null,
    requisitionNumber: (data.requisitionNumber as string | undefined) ?? null,
    resolvedDate: (data.resolvedDate as Timestamp | undefined) ?? null,
    resolutionWorkOrder:
      (data.resolutionWorkOrder as string | undefined) ?? null,
    resolvedAt,
    resolvedBy: (data.resolvedBy as string | undefined) ?? null,
    resolutionKind,
    relatedDefectIds:
      (data.relatedDefectIds as string[] | undefined) ?? [],
    deferredAt: (data.deferredAt as Timestamp | undefined) ?? null,
    deferralReason: (data.deferralReason as string | undefined) ?? null,
    deferredBy: (data.deferredBy as string | undefined) ?? null,
    estimated: (data.estimated as boolean | undefined) ?? false,
    estimatedManHours:
      (data.estimatedManHours as number | null | undefined) ?? null,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

export function subscribeDefects(
  callback: (defects: Defect[]) => void,
): () => void {
  const q = query(defectsCol(), orderBy("reportedDate", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToDefect(d.id, d.data())));
  });
}

export async function createDefect(input: DefectInput): Promise<string> {
  validate(input);
  const tail = normaliseTailNumber(input.tailNumber);
  const wo = input.workOrderNumber?.trim() || null;
  const req = input.requisitionNumber?.trim() || null;
  const relatedIds = await filterValidRelatedIds(tail, input.relatedDefectIds);
  const ref = await addDoc(defectsCol(), {
    tailNumber: tail,
    title: input.title.trim(),
    reportedDate: Timestamp.fromDate(input.reportedDate),
    reportedTtafMinutes: input.reportedTtafMinutes,
    workOrderNumber: wo,
    requisitionNumber: req,
    resolvedDate: null,
    resolutionWorkOrder: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionKind: null,
    relatedDefectIds: relatedIds,
    deferredAt: null,
    deferralReason: null,
    deferredBy: null,
    estimated: false,
    estimatedManHours: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const recurrenceSuffix =
    relatedIds.length > 0
      ? ` (recurrence — linked to ${relatedIds.length} prior)`
      : "";
  logAudit(tail, {
    action: "create",
    entity: "defect",
    entityId: ref.id,
    summary: `Defect reported: ${input.title.trim()} (at TTAF ${formatMinutesAsDuration(input.reportedTtafMinutes)}, reported ${formatDate(Timestamp.fromDate(input.reportedDate))}${wo ? `, WO ${wo}` : ""})${recurrenceSuffix}`,
  });
  return ref.id;
}

export async function updateDefect(
  id: string,
  patch: Partial<Omit<DefectInput, "tailNumber">>,
): Promise<void> {
  const existingSnap = await getDoc(defectDoc(id));
  const prev = existingSnap.exists()
    ? docToDefect(id, existingSnap.data())
    : null;

  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.reportedDate !== undefined) {
    update.reportedDate = Timestamp.fromDate(patch.reportedDate);
  }
  if (patch.reportedTtafMinutes !== undefined) {
    update.reportedTtafMinutes = patch.reportedTtafMinutes;
  }
  if (patch.workOrderNumber !== undefined) {
    update.workOrderNumber = patch.workOrderNumber?.trim() || null;
  }
  if (patch.requisitionNumber !== undefined) {
    update.requisitionNumber = patch.requisitionNumber?.trim() || null;
  }
  let nextRelatedIds: string[] | null = null;
  if (patch.relatedDefectIds !== undefined && prev) {
    nextRelatedIds = await filterValidRelatedIds(
      prev.tailNumber,
      patch.relatedDefectIds,
      id,
    );
    update.relatedDefectIds = nextRelatedIds;
  }
  await updateDoc(defectDoc(id), update);

  if (prev) {
    const changes: string[] = [];
    if (patch.title !== undefined && patch.title.trim() !== prev.title) {
      changes.push(`title "${prev.title}" → "${patch.title.trim()}"`);
    }
    if (patch.reportedDate !== undefined) {
      const next = formatDate(Timestamp.fromDate(patch.reportedDate));
      const prevStr = formatDate(prev.reportedDate);
      if (next !== prevStr) changes.push(`date ${prevStr} → ${next}`);
    }
    if (patch.reportedTtafMinutes !== undefined) {
      if (patch.reportedTtafMinutes !== prev.reportedTtafMinutes) {
        changes.push(
          `TTAF ${formatMinutesAsDuration(prev.reportedTtafMinutes)} → ${formatMinutesAsDuration(patch.reportedTtafMinutes)}`,
        );
      }
    }
    if (patch.workOrderNumber !== undefined) {
      const nextWo = patch.workOrderNumber?.trim() || null;
      if ((prev.workOrderNumber ?? null) !== nextWo) {
        changes.push(`WO ${prev.workOrderNumber ?? "—"} → ${nextWo ?? "—"}`);
      }
    }
    if (patch.requisitionNumber !== undefined) {
      const nextReq = patch.requisitionNumber?.trim() || null;
      if ((prev.requisitionNumber ?? null) !== nextReq) {
        changes.push(`REQ ${prev.requisitionNumber ?? "—"} → ${nextReq ?? "—"}`);
      }
    }
    if (changes.length > 0) {
      logAudit(prev.tailNumber, {
        action: "update",
        entity: "defect",
        entityId: id,
        summary: `Defect "${prev.title}" updated: ${changes.join("; ")}`,
      });
    }
    if (nextRelatedIds !== null) {
      const prevSet = new Set(prev.relatedDefectIds);
      const nextSet = new Set(nextRelatedIds);
      const sameSet =
        prevSet.size === nextSet.size &&
        [...prevSet].every((x) => nextSet.has(x));
      if (!sameSet) {
        logAudit(prev.tailNumber, {
          action: "update",
          entity: "defect",
          entityId: id,
          summary: `Defect "${prev.title}" links updated: was ${prevSet.size}, now ${nextSet.size}`,
        });
      }
    }
  }
}

export type ResolveDefectInput = {
  resolvedDate: Date;
  resolutionWorkOrder: string;
  resolutionKind: "fixed" | "nff";
};

export async function resolveDefect(
  id: string,
  input: ResolveDefectInput,
  byUid: string,
): Promise<void> {
  if (
    !(input.resolvedDate instanceof Date) ||
    isNaN(input.resolvedDate.valueOf())
  ) {
    throw new Error("Resolution date is required.");
  }
  const wo = input.resolutionWorkOrder.trim();
  if (!wo) throw new Error("Work order number is required.");
  if (input.resolutionKind !== "fixed" && input.resolutionKind !== "nff") {
    throw new Error("Resolution kind is required.");
  }

  const snap = await getDoc(defectDoc(id));
  if (!snap.exists()) throw new Error("Defect not found.");
  const prev = docToDefect(id, snap.data());
  if (prev.resolvedAt) throw new Error("Defect is already resolved.");

  await updateDoc(defectDoc(id), {
    resolvedDate: Timestamp.fromDate(input.resolvedDate),
    resolutionWorkOrder: wo,
    resolvedAt: serverTimestamp(),
    resolvedBy: byUid,
    resolutionKind: input.resolutionKind,
    updatedAt: serverTimestamp(),
  });

  const dateStr = formatDate(Timestamp.fromDate(input.resolvedDate));
  const summary =
    input.resolutionKind === "fixed"
      ? `Defect resolved (fixed): "${prev.title}" (WO ${wo}, on ${dateStr})`
      : `Defect closed NFF: "${prev.title}" (WO ${wo}, on ${dateStr})`;
  logAudit(prev.tailNumber, {
    action: "update",
    entity: "defect",
    entityId: id,
    summary,
  });

  // Auto-lift any groundings that pointed at this defect. The query is
  // bounded (at most one aircraft per defect under normal use) and the lift
  // writes its own audit entry so the chain reads "Defect resolved …" →
  // "Ungrounded — linked defect resolved" on the same tail.
  const groundedTails = await findAircraftGroundedByCause("defect", id);
  await Promise.all(
    groundedTails.map((tail) =>
      liftGrounding(tail, {
        kind: "defect-resolved",
        defectTitle: prev.title,
        workOrder: wo,
      }),
    ),
  );
}

export async function deferDefect(
  id: string,
  reason: string,
  byUid: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to defer a defect.");

  const snap = await getDoc(defectDoc(id));
  if (!snap.exists()) throw new Error("Defect not found.");
  const prev = docToDefect(id, snap.data());
  if (prev.resolvedAt) throw new Error("Cannot defer a resolved defect.");

  const wasDeferred = prev.deferredAt != null;
  await updateDoc(defectDoc(id), {
    deferredAt: serverTimestamp(),
    deferralReason: trimmed,
    deferredBy: byUid,
    updatedAt: serverTimestamp(),
  });

  logAudit(prev.tailNumber, {
    action: "update",
    entity: "defect",
    entityId: id,
    summary: wasDeferred
      ? `Defect re-deferred: "${prev.title}" — ${trimmed}`
      : `Defect deferred (30-day review): "${prev.title}" — ${trimmed}`,
  });
}

export async function undeferDefect(id: string): Promise<void> {
  const snap = await getDoc(defectDoc(id));
  if (!snap.exists()) throw new Error("Defect not found.");
  const prev = docToDefect(id, snap.data());
  if (prev.deferredAt == null) return;

  await updateDoc(defectDoc(id), {
    deferredAt: null,
    deferralReason: null,
    deferredBy: null,
    updatedAt: serverTimestamp(),
  });

  logAudit(prev.tailNumber, {
    action: "update",
    entity: "defect",
    entityId: id,
    summary: `Defect deferral lifted: "${prev.title}"`,
  });
}

export type EstimatePatch = {
  estimated: boolean;
  estimatedManHours: number | null;
};

function describeEstimateChange(
  prevEstimated: boolean,
  prevHours: number | null,
  nextEstimated: boolean,
  nextHours: number | null,
): string | null {
  const parts: string[] = [];
  if (prevEstimated !== nextEstimated) {
    parts.push(`estimated ${prevEstimated ? "yes" : "no"} → ${nextEstimated ? "yes" : "no"}`);
  }
  if ((prevHours ?? null) !== (nextHours ?? null)) {
    parts.push(`man hours ${prevHours == null ? "—" : `${prevHours} MH`} → ${nextHours == null ? "—" : `${nextHours} MH`}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

export async function setDefectEstimate(
  id: string,
  patch: EstimatePatch,
): Promise<void> {
  const nextEstimated = patch.estimated;
  let nextHours: number | null = nextEstimated ? patch.estimatedManHours : null;
  if (nextHours != null) {
    if (!Number.isFinite(nextHours) || nextHours <= 0) {
      throw new Error("Man hours must be a positive number.");
    }
  }

  const snap = await getDoc(defectDoc(id));
  if (!snap.exists()) throw new Error("Defect not found.");
  const prev = docToDefect(id, snap.data());
  if (prev.resolvedAt) throw new Error("Cannot estimate a resolved defect.");

  await updateDoc(defectDoc(id), {
    estimated: nextEstimated,
    estimatedManHours: nextHours,
    updatedAt: serverTimestamp(),
  });

  const change = describeEstimateChange(
    prev.estimated,
    prev.estimatedManHours,
    nextEstimated,
    nextHours,
  );
  if (change) {
    logAudit(prev.tailNumber, {
      action: "update",
      entity: "defect",
      entityId: id,
      summary: `Defect estimate updated: "${prev.title}" — ${change}`,
    });
  }
}

export async function clearDefectEstimate(id: string): Promise<void> {
  const snap = await getDoc(defectDoc(id));
  if (!snap.exists()) throw new Error("Defect not found.");
  const prev = docToDefect(id, snap.data());
  if (!prev.estimated && prev.estimatedManHours == null) return;

  await updateDoc(defectDoc(id), {
    estimated: false,
    estimatedManHours: null,
    updatedAt: serverTimestamp(),
  });

  logAudit(prev.tailNumber, {
    action: "update",
    entity: "defect",
    entityId: id,
    summary: `Defect estimate cleared: "${prev.title}"`,
  });
}

export async function deleteDefect(id: string): Promise<void> {
  const snap = await getDoc(defectDoc(id));
  const prev = snap.exists() ? docToDefect(id, snap.data()) : null;
  await deleteDoc(defectDoc(id));
  if (prev) {
    logAudit(prev.tailNumber, {
      action: "delete",
      entity: "defect",
      entityId: id,
      summary: `Defect deleted: ${prev.title}`,
    });
  }
}
