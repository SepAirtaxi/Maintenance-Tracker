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
import type { Location, LocationKind } from "@/types";

const locationsCol = () => collection(db, "locations");
const locationDoc = (id: string) => doc(db, "locations", id);

export type LocationInput = {
  name: string;
  kind: LocationKind;
  notes: string | null;
  active: boolean;
};

function docToLocation(id: string, data: Record<string, unknown>): Location {
  return {
    id,
    name: data.name as string,
    kind: ((data.kind as LocationKind | undefined) ?? "hangar") as LocationKind,
    notes: (data.notes as string | null) ?? null,
    active: data.active !== false,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

export function subscribeLocations(
  callback: (locations: Location[]) => void,
): () => void {
  const q = query(locationsCol(), orderBy("name"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToLocation(d.id, d.data())));
  });
}

export async function createLocation(input: LocationInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Location name is required.");
  const ref = await addDoc(locationsCol(), {
    name,
    kind: input.kind,
    notes: input.notes?.trim() || null,
    active: input.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLocation(
  id: string,
  patch: Partial<LocationInput>,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Location name is required.");
    update.name = name;
  }
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.active !== undefined) update.active = patch.active;
  await updateDoc(locationDoc(id), update);
}

export async function deleteLocation(id: string): Promise<void> {
  await deleteDoc(locationDoc(id));
}

export async function getLocation(id: string): Promise<Location | null> {
  const snap = await getDoc(locationDoc(id));
  if (!snap.exists()) return null;
  return docToLocation(snap.id, snap.data());
}
