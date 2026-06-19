import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

// Singleton Postgres pool. Reads DATABASE_URL once at module load.
// Schema is created on first query so the app boots cleanly against an
// empty Postgres instance — no separate migration step.

let pool: Pool | undefined;
let initPromise: Promise<void> | undefined;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start Postgres (docker compose up).",
    );
  }
  pool = new Pool({ connectionString });
  return pool;
}

async function runSchema(): Promise<void> {
  const sqlPath = path.resolve(process.cwd(), "lib/db/schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await getPool().query(sql);
}

// Idempotent. Multiple callers share the same in-flight promise.
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = runSchema().catch((err) => {
      // Reset so the next call can retry instead of being stuck on a
      // poisoned rejected promise.
      initPromise = undefined;
      throw err;
    });
  }
  return initPromise;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[] }> {
  await ensureInit();
  const res = await getPool().query(text, params);
  return { rows: res.rows as T[] };
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureInit();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
