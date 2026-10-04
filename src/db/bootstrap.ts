import { pool, isDatabaseConfigured, adoptDatabaseUrl } from "./index";
import { SCHEMA_SQL, SCHEMA_TABLES } from "./schema-sql";
import { getStoredDatabaseUrl } from "@/lib/dbconfig";

export type DbStatus =
  | { ok: true }
  | { ok: false; code: "missing_url" | "connection" | "schema"; message: string };

class DbNotConfiguredError extends Error {
  code = "missing_url" as const;
  constructor() {
    super("No database connection string configured (DATABASE_URL / NETLIFY_DATABASE_URL).");
  }
}

const g = globalThis as typeof globalThis & {
  __erpSchemaReady?: boolean;
  __erpSchemaPromise?: Promise<void>;
};

/**
 * Make sure every table exists. Cheap after the first success (a boolean check),
 * memoised while in flight (concurrent requests share one promise) and retried on
 * the next call if it failed (e.g. the database was still waking up).
 *
 * Called from instrumentation (server cold start) and defensively from the data
 * access layer, so a fresh deployment needs no manual migration step.
 */
export function ensureSchema(): Promise<void> {
  if (g.__erpSchemaReady) return Promise.resolve();
  if (!g.__erpSchemaPromise) {
    g.__erpSchemaPromise = (async () => {
      if (!isDatabaseConfigured()) {
        // Fall back to the connection string saved by the in-app setup wizard
        // (Netlify Blobs / .data file) before giving up.
        const stored = await getStoredDatabaseUrl();
        if (stored) adoptDatabaseUrl(stored, "stored");
      }
      if (!isDatabaseConfigured()) throw new DbNotConfiguredError();
      const client = await pool.connect();
      try {
        const { rows } = await client.query<{ n: string }>(
          `select count(*)::text as n
             from information_schema.tables
            where table_schema = current_schema()
              and table_name = any($1::text[])`,
          [[...SCHEMA_TABLES]]
        );
        if (Number(rows[0]?.n ?? 0) < SCHEMA_TABLES.length) {
          await client.query(SCHEMA_SQL);
          console.log(`[db] schema bootstrapped (${SCHEMA_TABLES.length} tables verified)`);
        }
      } finally {
        client.release();
      }
      g.__erpSchemaReady = true;
    })().catch((err) => {
      g.__erpSchemaPromise = undefined;
      throw err;
    });
  }
  return g.__erpSchemaPromise;
}

const CONNECTION_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "EHOSTUNREACH", "28P01", "28000", "3D000", "08001", "08006", "57P01", "57P03"]);

function classify(err: unknown): DbStatus {
  const e = err as { code?: string; message?: string } | undefined;
  const message = e?.message ?? String(err);
  if (e?.code === "missing_url") return { ok: false, code: "missing_url", message };
  if (
    (e?.code && CONNECTION_CODES.has(e.code)) ||
    /timeout|ssl|tls|certificate|self[- ]signed|password|authentication|does not exist|getaddrinfo|connect/i.test(message)
  ) {
    return { ok: false, code: "connection", message };
  }
  return { ok: false, code: "schema", message };
}

/** Never throws – used by the root layout to decide between the app and the setup screen. */
export async function getDbStatus(): Promise<DbStatus> {
  try {
    await ensureSchema();
    return { ok: true };
  } catch (err) {
    return classify(err);
  }
}

/** Live round-trip used by /api/health (bypasses the memoised flag). */
export async function pingDatabase(): Promise<DbStatus> {
  try {
    await ensureSchema();
    await pool.query("select 1");
    return { ok: true };
  } catch (err) {
    return classify(err);
  }
}
