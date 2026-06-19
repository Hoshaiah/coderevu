// No login, no cookies — this app runs as a single-user self-hosted instance.
// All progress, conversations, and usage events are keyed under one fixed
// session id. Anyone who has access to the deployment shares the same state.
//
// Override with CODEREVU_SESSION_ID if you want to swap between profiles
// (e.g. run two instances against the same Postgres with different ids).

const DEFAULT_SESSION_ID = "00000000-0000-0000-0000-000000000001";

export async function getOrCreateSessionId(): Promise<string> {
  return process.env.CODEREVU_SESSION_ID || DEFAULT_SESSION_ID;
}
