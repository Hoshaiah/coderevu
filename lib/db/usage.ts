import { query } from "@/lib/db/client";

export async function recordUsageEvent(
  sessionId: string,
  problemSlug: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  costUsd: number,
): Promise<void> {
  await query(
    `INSERT INTO usage_events (session_id, problem_slug, model, tokens_in, tokens_out, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, problemSlug, model, tokensIn, tokensOut, costUsd],
  );
}
