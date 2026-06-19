import { query } from "@/lib/db/client";
import type { ChatMessage, ConversationDoc } from "@/lib/db/types";

type ConversationRow = {
  messages: ChatMessage[];
  updated_at: Date;
};

export async function getConversation(
  sessionId: string,
  problemSlug: string,
): Promise<ConversationDoc | null> {
  const res = await query<ConversationRow>(
    `SELECT messages, updated_at
       FROM conversations
      WHERE session_id = $1 AND problem_slug = $2`,
    [sessionId, problemSlug],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { messages: row.messages, updatedAt: row.updated_at };
}

export async function appendMessages(
  sessionId: string,
  problemSlug: string,
  messages: ChatMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  await query(
    `INSERT INTO conversations (session_id, problem_slug, messages, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (session_id, problem_slug) DO UPDATE
       SET messages   = conversations.messages || EXCLUDED.messages,
           updated_at = now()`,
    [sessionId, problemSlug, JSON.stringify(messages)],
  );
}

// Soft clear — keep the row, drop the messages array. Mirrors the old
// Firestore behavior so the rest of the UI is unchanged.
export async function clearConversation(
  sessionId: string,
  problemSlug: string,
): Promise<void> {
  await query(
    `INSERT INTO conversations (session_id, problem_slug, messages, updated_at)
     VALUES ($1, $2, '[]'::jsonb, now())
     ON CONFLICT (session_id, problem_slug) DO UPDATE
       SET messages   = '[]'::jsonb,
           updated_at = now()`,
    [sessionId, problemSlug],
  );
}
