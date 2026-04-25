import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ProgressDoc, ProgressStatus } from "@/lib/db/types";

function progressRef(uid: string, problemId: string) {
  return adminDb().collection("users").doc(uid).collection("progress").doc(problemId);
}

export async function getProgress(
  uid: string,
  problemId: string,
): Promise<ProgressDoc | null> {
  const snap = await progressRef(uid, problemId).get();
  return snap.exists ? (snap.data() as ProgressDoc) : null;
}

// Batch-fetch progress docs for a list of problem IDs. Returns a map keyed by
// problemId (missing docs are absent from the map).
export async function listProgressByProblemIds(
  uid: string,
  problemIds: string[],
): Promise<Record<string, ProgressDoc>> {
  if (problemIds.length === 0) return {};
  const refs = problemIds.map((id) => progressRef(uid, id));
  const snaps = await adminDb().getAll(...refs);
  const out: Record<string, ProgressDoc> = {};
  snaps.forEach((snap, i) => {
    if (snap.exists) out[problemIds[i]] = snap.data() as ProgressDoc;
  });
  return out;
}

// Saves the user's draft. If no doc exists yet, creates one in "in-progress"
// so the status pill reflects that they've started. If one exists and status
// is "todo", auto-bumps to "in-progress" on the first edit.
export async function upsertDraft(
  uid: string,
  problemId: string,
  draftCode: string,
): Promise<void> {
  const ref = progressRef(uid, problemId);
  const snap = await ref.get();
  const now = Timestamp.now();
  if (!snap.exists) {
    const doc: ProgressDoc = {
      status: "in-progress",
      revealed: false,
      draftCode,
      startedAt: now,
      updatedAt: now,
    };
    await ref.set(doc);
    return;
  }
  const data = snap.data() as ProgressDoc;
  const updates: Record<string, unknown> = { draftCode, updatedAt: now };
  if (data.status === "todo") updates.status = "in-progress";
  await ref.update(updates);
}

export async function setProgressStatus(
  uid: string,
  problemId: string,
  status: ProgressStatus,
): Promise<void> {
  const ref = progressRef(uid, problemId);
  const snap = await ref.get();
  const now = Timestamp.now();
  if (!snap.exists) {
    const doc: ProgressDoc = {
      status,
      revealed: false,
      draftCode: null,
      startedAt: now,
      updatedAt: now,
    };
    await ref.set(doc);
    return;
  }
  await ref.update({ status, updatedAt: now });
}

export async function setRevealed(
  uid: string,
  problemId: string,
  revealed: boolean,
): Promise<void> {
  const ref = progressRef(uid, problemId);
  const snap = await ref.get();
  const now = Timestamp.now();
  if (!snap.exists) {
    const doc: ProgressDoc = {
      status: "in-progress",
      revealed,
      draftCode: null,
      startedAt: now,
      updatedAt: now,
    };
    await ref.set(doc);
    return;
  }
  await ref.update({ revealed, updatedAt: now });
}
