import { adminDb } from "@/lib/firebase/admin";
import type { ProblemDoc, TrackId } from "@/lib/db/types";

export function problemId(track: TrackId, slug: string): string {
  return `${track}__${slug}`;
}

export async function getProblemById(id: string): Promise<ProblemDoc | null> {
  const snap = await adminDb().collection("problems").doc(id).get();
  return snap.exists ? (snap.data() as ProblemDoc) : null;
}

export async function getProblemBySlug(
  track: TrackId,
  slug: string,
): Promise<ProblemDoc | null> {
  return getProblemById(problemId(track, slug));
}

export async function listTrackProblems(track: TrackId): Promise<ProblemDoc[]> {
  const snap = await adminDb()
    .collection("problems")
    .where("track", "==", track)
    .orderBy("orderIndex", "asc")
    .get();
  return snap.docs.map((d) => d.data() as ProblemDoc);
}
