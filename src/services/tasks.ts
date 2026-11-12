import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requireCurrentUserCtx } from "@/lib/currentUser";
import type { Task } from "@/types";

const tasksCol = () => collection(db, "tasks");
const taskDoc = (id: string) => doc(db, "tasks", id);

export const TASK_TITLE_MAX = 200;
export const TASK_DETAIL_MAX = 1000;

function docToTask(id: string, data: Record<string, unknown>): Task {
  const now = Timestamp.now();
  return {
    id,
    ownerUid: (data.ownerUid as string) ?? "",
    title: (data.title as string) ?? "",
    detail: (data.detail as string | null) ?? null,
    rank: (data.rank as number) ?? 0,
    done: (data.done as boolean) ?? false,
    doneAt: (data.doneAt as Timestamp | null) ?? null,
    createdAt: (data.createdAt as Timestamp) ?? now,
    updatedAt: (data.updatedAt as Timestamp) ?? now,
  };
}

export function subscribeTasks(
  callback: (tasks: Task[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    tasksCol(),
    (snap) => {
      callback(
        snap.docs.map((d) =>
          docToTask(d.id, d.data({ serverTimestamps: "estimate" })),
        ),
      );
    },
    (err) => onError?.(err),
  );
}

const cleanTitle = (s: string) => s.trim().slice(0, TASK_TITLE_MAX);
const cleanDetail = (s: string | null) => {
  const t = (s ?? "").trim().slice(0, TASK_DETAIL_MAX);
  return t ? t : null;
};

export type NewTask = { title: string; detail?: string | null };

// Adds one or more tasks for the signed-in member, at the bottom of their
// active list (in the given order). `bottomRank` is the current highest rank
// in their active list, or -1 when it's empty.
export async function addTasks(
  items: NewTask[],
  bottomRank: number,
): Promise<number> {
  const user = requireCurrentUserCtx();
  const clean = items
    .map((t) => ({ title: cleanTitle(t.title), detail: cleanDetail(t.detail ?? null) }))
    .filter((t) => t.title);
  if (clean.length === 0) return 0;
  // Firestore batches cap at 500 writes; a pasted list is never near that,
  // but chunk anyway so a huge paste can't fail half-way silently.
  let rank = Math.floor(bottomRank) + 1;
  for (let i = 0; i < clean.length; i += 400) {
    const batch = writeBatch(db);
    for (const { title, detail } of clean.slice(i, i + 400)) {
      batch.set(doc(tasksCol()), {
        ownerUid: user.uid,
        title,
        detail,
        rank: rank++,
        done: false,
        doneAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return clean.length;
}

export async function updateTask(
  id: string,
  patch: { title: string; detail: string | null },
): Promise<void> {
  const title = cleanTitle(patch.title);
  if (!title) throw new Error("A task needs a title.");
  await updateDoc(taskDoc(id), {
    title,
    detail: cleanDetail(patch.detail),
    updatedAt: serverTimestamp(),
  });
}

// Writes a new priority order for one member's active list. Ranks become the
// list position; only notes whose position actually changed are written.
export async function reorderTasks(ordered: Task[]): Promise<void> {
  const batch = writeBatch(db);
  let writes = 0;
  ordered.forEach((t, i) => {
    if (t.rank !== i) {
      batch.update(taskDoc(t.id), { rank: i, updatedAt: serverTimestamp() });
      writes++;
    }
  });
  if (writes > 0) await batch.commit();
}

export async function completeTask(id: string): Promise<void> {
  await updateDoc(taskDoc(id), {
    done: true,
    doneAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Puts a finished note back at the bottom of the active list.
export async function reopenTask(id: string, bottomRank: number): Promise<void> {
  await updateDoc(taskDoc(id), {
    done: false,
    doneAt: null,
    rank: Math.floor(bottomRank) + 1,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(taskDoc(id));
}
