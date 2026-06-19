import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/db/session";
import { clearConversation } from "@/lib/db/conversations";

export const runtime = "nodejs";

type Body = { problemId?: string };

export async function POST(req: Request) {
  const sessionId = await getOrCreateSessionId();
  const body = (await req.json()) as Body;
  if (!body.problemId) {
    return NextResponse.json({ error: "problemId required" }, { status: 400 });
  }
  await clearConversation(sessionId, body.problemId);
  return NextResponse.json({ ok: true });
}
