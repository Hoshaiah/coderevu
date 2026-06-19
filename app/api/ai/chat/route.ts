import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getOrCreateSessionId } from "@/lib/db/session";
import { getProblemById } from "@/lib/db/problems";
import { getProgress } from "@/lib/db/progress";
import { appendMessages } from "@/lib/db/conversations";
import { recordUsageEvent } from "@/lib/db/usage";
import { CHAT_MODEL, computeCostUsd } from "@/lib/ai/pricing";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { ChatMessage } from "@/lib/db/types";

// AI chat is open to every browser session. Self-hosters absorb the
// Anthropic API cost — consider adding your own rate limiting (per-IP,
// per-session, etc.) before exposing this publicly.

export const runtime = "nodejs";
export const maxDuration = 60;

const META_SENTINEL = "\n\n---META---\n";

type Body = {
  problemId?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  draft?: string;
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI is not configured — set ANTHROPIC_API_KEY in .env to enable the AI tutor.",
      },
      { status: 503 },
    );
  }

  const sessionId = await getOrCreateSessionId();

  const body = (await req.json()) as Body;
  const { problemId, messages, draft } = body;
  if (!problemId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be user" }, { status: 400 });
  }

  const problem = getProblemById(problemId);
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

  const progress = await getProgress(sessionId, problemId);
  const revealed = progress?.revealed === true;
  const system = buildSystemPrompt(problem, draft ?? null, revealed);

  const anthropic = new Anthropic({ apiKey });

  const userMessage = messages[messages.length - 1];

  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const encoder = new TextEncoder();

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

        await recordUsageEvent(
          sessionId,
          problemId,
          CHAT_MODEL,
          tokensIn,
          tokensOut,
          costUsd,
        );
        const now = new Date().toISOString();
        const persistable: ChatMessage[] = [
          { role: "user", content: userMessage.content, createdAt: now },
          {
            role: "assistant",
            content: assistantText,
            tokensIn,
            tokensOut,
            costUsd,
            createdAt: now,
          },
        ];
        await appendMessages(sessionId, problemId, persistable);

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
