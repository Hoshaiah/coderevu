import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { clearConversation } from "@/lib/db/conversations";

export const runtime = "nodejs";

type Body = { problemId?: string };

export async function POST(req: Request) {
  const session = await requireSession();
  const body = (await req.json()) as Body;
  if (!body.problemId) {
    return NextResponse.json({ error: "problemId required" }, { status: 400 });
  }
  await clearConversation(session.uid, body.problemId);
  return NextResponse.json({ ok: true });
}
