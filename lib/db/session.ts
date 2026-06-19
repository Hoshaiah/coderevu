import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// Anonymous progress is tied to a long-lived cookie. There is no login —
// one browser, one session_id, ten years of cookie life. Clearing cookies
// effectively starts a new identity.

export const SESSION_COOKIE = "coderevu_session";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

// Returns the existing session uuid from the cookie, or mints a new one
// and sets the cookie on the response. Safe to call from server actions,
// route handlers, and server components that participate in a request
// that can mutate cookies. In a strict server component render Next won't
// allow the .set call — that's fine, the cookie is created the next time
// the browser hits a mutation-capable handler.
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing && isUuid(existing)) return existing;

  const id = randomUUID();
  try {
    store.set({
      name: SESSION_COOKIE,
      value: id,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TEN_YEARS_SECONDS,
    });
  } catch {
    // Cookie writes are illegal in some render contexts (e.g. a pure
    // server component without an action). The session will still be
    // generated for the duration of this request; the persistent cookie
    // is set on the next mutation-capable call (server action, route
    // handler).
  }
  return id;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
