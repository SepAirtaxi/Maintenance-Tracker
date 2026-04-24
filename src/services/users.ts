import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { deriveInitialsFromEmail } from "@/lib/initials";
import type { UserProfile } from "@/types";

const userDoc = (uid: string) => doc(db, "users", uid);

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const ref = userDoc(user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { uid: user.uid, ...(snap.data() as Omit<UserProfile, "uid">) };
  }

  const email = user.email ?? "";
  const initials = deriveInitialsFromEmail(email);
  const payload = {
    email,
    initials,
    displayName: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);

  const fresh = await getDoc(ref);
  return { uid: user.uid, ...(fresh.data() as Omit<UserProfile, "uid">) };
}

export async function updateUserProfile(
  uid: string,
  patch: { initials?: string; displayName?: string | null },
): Promise<void> {
  await updateDoc(userDoc(uid), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
