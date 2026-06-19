import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { type TrackId, type UserDoc } from "@/lib/db/types";

export async function ensureUserDoc(input: {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}): Promise<void> {
  const ref = adminDb().collection("users").doc(input.uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({
      email: input.email,
      displayName: input.displayName,
      photoURL: input.photoURL,
    });
    return;
  }
  const doc: UserDoc = {
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    primaryTrack: null,
    createdAt: Timestamp.now(),
  };
  await ref.set(doc);
}

// Legacy primaryTrack values that have been folded into other tracks.
const LEGACY_TRACK_ALIASES: Record<string, TrackId> = {
  rails: "ruby",
  react: "javascript",
};

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const doc = snap.data() as UserDoc;
  const primary = doc.primaryTrack as unknown as string | null;
  if (primary && LEGACY_TRACK_ALIASES[primary]) {
    doc.primaryTrack = LEGACY_TRACK_ALIASES[primary];
  }
  return doc;
}

export async function setPrimaryTrack(uid: string, track: TrackId): Promise<void> {
  await adminDb().collection("users").doc(uid).update({ primaryTrack: track });
}
