"use server";

import { getOrCreateSessionId } from "@/lib/db/session";
import { upsertDraft, setProgressStatus, setRevealed } from "@/lib/db/progress";
import type { ProgressStatus } from "@/lib/db/types";

export async function saveDraft(problemId: string, draft: string) {
  const sessionId = await getOrCreateSessionId();
  await upsertDraft(sessionId, problemId, draft);
}

export async function revealSolution(problemId: string) {
  const sessionId = await getOrCreateSessionId();
  await setRevealed(sessionId, problemId, true);
}

export async function setStatus(problemId: string, status: ProgressStatus) {
  const sessionId = await getOrCreateSessionId();
  await setProgressStatus(sessionId, problemId, status);
}
