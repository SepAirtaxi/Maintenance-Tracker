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
import type { Defect } from "@/types";

const defectsCol = () => collection(db, "defects");
const defectDoc = (id: string) => doc(db, "defects", id);

export type DefectInput = {
  tailNumber: string;
  title: string;
  reportedDate: Date;
  reportedTtafMinutes: number;
};

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
  return {
    id,
    tailNumber: data.tailNumber as string,
    title: data.title as string,
    reportedDate: data.reportedDate as Timestamp,
    reportedTtafMinutes: data.reportedTtafMinutes as number,
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
  const ref = await addDoc(defectsCol(), {
    tailNumber: tail,
    title: input.title.trim(),
    reportedDate: Timestamp.fromDate(input.reportedDate),
    reportedTtafMinutes: input.reportedTtafMinutes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logAudit(tail, {
    action: "create",
    entity: "defect",
    entityId: ref.id,
    summary: `Defect reported: ${input.title.trim()} (at TTAF ${formatMinutesAsDuration(input.reportedTtafMinutes)}, reported ${formatDate(Timestamp.fromDate(input.reportedDate))})`,
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
    if (changes.length > 0) {
      logAudit(prev.tailNumber, {
        action: "update",
        entity: "defect",
        entityId: id,
        summary: `Defect "${prev.title}" updated: ${changes.join("; ")}`,
      });
    }
  }
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
