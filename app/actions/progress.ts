"use server";

import { requireSession } from "@/lib/auth/session";
import { upsertDraft, setProgressStatus, setRevealed } from "@/lib/db/progress";
import type { ProgressStatus } from "@/lib/db/types";

export async function saveDraft(problemId: string, draft: string) {
  const session = await requireSession();
  await upsertDraft(session.uid, problemId, draft);
}

export async function revealSolution(problemId: string) {
  const session = await requireSession();
  await setRevealed(session.uid, problemId, true);
}

// User-facing status setter — accepts "todo" | "in-progress" | "complete".
export async function setStatus(
  problemId: string,
  status: Extract<ProgressStatus, "todo" | "in-progress" | "complete">,
) {
  const session = await requireSession();
  await setProgressStatus(session.uid, problemId, status);
}
