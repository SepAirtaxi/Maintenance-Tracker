import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normaliseTailNumber } from "@/lib/tails";
import type { EventTemplate } from "@/types";

const templatesCol = () => collection(db, "eventTemplates");
const templateDoc = (id: string) => doc(db, "eventTemplates", id);
const eventsCol = () => collection(db, "events");

export type EventTemplateInput = {
  title: string;
  tailNumbers: string[];
  active: boolean;
};

function docToTemplate(
  id: string,
  data: Record<string, unknown>,
): EventTemplate {
  return {
    id,
    title: data.title as string,
    tailNumbers: ((data.tailNumbers as string[] | undefined) ?? []).map(
      normaliseTailNumber,
    ),
    active: data.active !== false,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

export function subscribeEventTemplates(
  callback: (templates: EventTemplate[]) => void,
): () => void {
  const q = query(templatesCol(), orderBy("title"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToTemplate(d.id, d.data())));
  });
}

function normaliseInput(input: EventTemplateInput): {
  title: string;
  tailNumbers: string[];
  active: boolean;
} {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");
  const tails = Array.from(
    new Set(input.tailNumbers.map(normaliseTailNumber).filter(Boolean)),
  );
  return { title, tailNumbers: tails, active: input.active };
}

export async function createEventTemplate(
  input: EventTemplateInput,
): Promise<string> {
  const data = normaliseInput(input);
  const ref = await addDoc(templatesCol(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEventTemplate(
  id: string,
  patch: Partial<EventTemplateInput>,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("Title is required.");
    update.title = title;
  }
  if (patch.tailNumbers !== undefined) {
    update.tailNumbers = Array.from(
      new Set(patch.tailNumbers.map(normaliseTailNumber).filter(Boolean)),
    );
  }
  if (patch.active !== undefined) update.active = patch.active;
  await updateDoc(templateDoc(id), update);
}

// Returns the tail numbers (deduplicated, sorted) of all unresolved events
// that reference this template. Used by the delete dialog to block the user
// with a meaningful "this is still in use on …" message rather than silently
// orphaning events.
export async function findUnresolvedEventTailsForTemplate(
  templateId: string,
): Promise<string[]> {
  const q = query(eventsCol(), where("templateId", "==", templateId));
  const snap = await getDocs(q);
  const tails = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.resolvedAt) continue;
    const tail = data.tailNumber as string | undefined;
    if (tail) tails.add(tail);
  }
  return Array.from(tails).sort();
}

export async function deleteEventTemplate(id: string): Promise<void> {
  const blockedTails = await findUnresolvedEventTailsForTemplate(id);
  if (blockedTails.length > 0) {
    const list = blockedTails.join(", ");
    throw new Error(
      `Cannot delete — still linked to unresolved events on ${blockedTails.length} aircraft (${list}). Resolve or unlink them first, or set the template Inactive instead.`,
    );
  }
  await deleteDoc(templateDoc(id));
}
