import { NextResponse } from "next/server";
import {
  createSessionCookie,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/auth/session";
import { ensureUserDoc } from "@/lib/db/users";
import { adminAuth } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const { idToken } = (await req.json()) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "missing idToken" }, { status: 400 });

  const decoded = await adminAuth().verifyIdToken(idToken);
  await ensureUserDoc({
    uid: decoded.uid,
    email: decoded.email ?? "",
    displayName: (decoded.name as string) ?? "",
    photoURL: (decoded.picture as string) ?? "",
  });

  const session = await createSessionCookie(idToken);
  await setSessionCookie(session);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
