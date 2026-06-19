import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Timestamp } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import { getProblemById } from "@/lib/db/problems";
import { getProgress } from "@/lib/db/progress";
import { appendMessages, recordUsageEvent } from "@/lib/db/conversations";
import { CHAT_MODEL, computeCostUsd } from "@/lib/ai/pricing";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

// AI chat is open to every signed-in user. Self-hosters absorb the Anthropic
// API cost — consider adding your own rate limiting (per-IP, per-user, etc.)
// before exposing this publicly.

export const runtime = "nodejs";
export const maxDuration = 60;

const META_SENTINEL = "\n\n---META---\n";

type Body = {
  problemId?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  draft?: string;
};

export async function POST(req: Request) {
  const session = await requireSession();

  const body = (await req.json()) as Body;
  const { problemId, messages, draft } = body;
  if (!problemId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be user" }, { status: 400 });
  }

  const problem = await getProblemById(problemId);
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

  const progress = await getProgress(session.uid, problemId);
  const revealed = progress?.status === "revealed" || progress?.status === "solved";
  const system = buildSystemPrompt(problem, draft ?? null, revealed);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  const anthropic = new Anthropic({ apiKey });

  const userMessage = messages[messages.length - 1];
  const historyForPersist = [userMessage];

  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const encoder = new TextEncoder();
  const uid = session.uid;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      try {
        stream.on("text", (delta: string) => {
          assistantText += delta;
          controller.enqueue(encoder.encode(delta));
        });

        const finalMessage = await stream.finalMessage();
        const tokensIn = finalMessage.usage?.input_tokens ?? 0;
        const tokensOut = finalMessage.usage?.output_tokens ?? 0;
        const costUsd = computeCostUsd(CHAT_MODEL, tokensIn, tokensOut);

        await recordUsageEvent({
          userId: uid,
          problemId,
          model: CHAT_MODEL,
          tokensIn,
          tokensOut,
          costUsd,
        });
        await appendMessages(
          uid,
          problemId,
          [
            { ...historyForPersist[0], createdAt: Timestamp.now() },
            {
              role: "assistant",
              content: assistantText,
              tokensIn,
              tokensOut,
              costUsd,
              createdAt: Timestamp.now(),
            },
          ],
          costUsd,
        );

        const meta = JSON.stringify({ tokensIn, tokensOut, costUsd });
        controller.enqueue(encoder.encode(META_SENTINEL + meta));
        controller.close();
      } catch (err) {
        console.error("AI stream error", err);
        try {
          controller.error(err);
        } catch {}
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
