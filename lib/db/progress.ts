import { query } from "@/lib/db/client";
import type { ProgressDoc, ProgressStatus } from "@/lib/db/types";

type ProgressRow = {
  status: ProgressStatus;
  revealed: boolean;
  draft_code: string | null;
  started_at: Date;
  updated_at: Date;
};

function rowToDoc(row: ProgressRow): ProgressDoc {
  return {
    status: row.status,
    revealed: row.revealed,
    draftCode: row.draft_code,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}

export async function getProgress(
  sessionId: string,
  problemSlug: string,
): Promise<ProgressDoc | null> {
  const res = await query<ProgressRow>(
    `SELECT status, revealed, draft_code, started_at, updated_at
       FROM progress
      WHERE session_id = $1 AND problem_slug = $2`,
    [sessionId, problemSlug],
  );
  const row = res.rows[0];
  return row ? rowToDoc(row) : null;
}

export async function listProgressBySlugs(
  sessionId: string,
  problemSlugs: string[],
): Promise<Record<string, ProgressDoc>> {
  if (problemSlugs.length === 0) return {};
  const res = await query<ProgressRow & { problem_slug: string }>(
    `SELECT problem_slug, status, revealed, draft_code, started_at, updated_at
       FROM progress
      WHERE session_id = $1 AND problem_slug = ANY($2::text[])`,
    [sessionId, problemSlugs],
  );
  const out: Record<string, ProgressDoc> = {};
  for (const row of res.rows) {
    out[row.problem_slug] = rowToDoc(row);
  }
  return out;
}

// Saves the user's draft. Auto-creates the row in "in-progress" if absent,
// and bumps "todo" → "in-progress" on the first edit.
export async function upsertDraft(
  sessionId: string,
  problemSlug: string,
  draftCode: string,
): Promise<void> {
  await query(
    `INSERT INTO progress (session_id, problem_slug, status, revealed, draft_code, started_at, updated_at)
     VALUES ($1, $2, 'in-progress', false, $3, now(), now())
     ON CONFLICT (session_id, problem_slug) DO UPDATE
       SET draft_code = EXCLUDED.draft_code,
           status     = CASE WHEN progress.status = 'todo' THEN 'in-progress' ELSE progress.status END,
           updated_at = now()`,
    [sessionId, problemSlug, draftCode],
  );
}

export async function setProgressStatus(
  sessionId: string,
  problemSlug: string,
  status: ProgressStatus,
): Promise<void> {
  await query(
    `INSERT INTO progress (session_id, problem_slug, status, revealed, draft_code, started_at, updated_at)
     VALUES ($1, $2, $3, false, NULL, now(), now())
     ON CONFLICT (session_id, problem_slug) DO UPDATE
       SET status = EXCLUDED.status,
           updated_at = now()`,
    [sessionId, problemSlug, status],
  );
}

export async function setRevealed(
  sessionId: string,
  problemSlug: string,
  revealed: boolean,
): Promise<void> {
  await query(
    `INSERT INTO progress (session_id, problem_slug, status, revealed, draft_code, started_at, updated_at)
     VALUES ($1, $2, 'in-progress', $3, NULL, now(), now())
     ON CONFLICT (session_id, problem_slug) DO UPDATE
       SET revealed = EXCLUDED.revealed,
           updated_at = now()`,
    [sessionId, problemSlug, revealed],
  );
}
