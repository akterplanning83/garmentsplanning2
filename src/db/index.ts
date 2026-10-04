import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

export const DB_URL_VARS = ["DATABASE_URL", "NETLIFY_DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL"] as const;

/** Which connection-string variables are present (names only, never values). */
export function detectedDbVars(): { name: string; present: boolean }[] {
  return DB_URL_VARS.map((name) => ({ name, present: Boolean(process.env[name]?.trim()) }));
}

/**
 * Resolve the connection string from the common provider conventions:
 *  - DATABASE_URL           (generic – Neon, Supabase, Railway, local .env)
 *  - NETLIFY_DATABASE_URL   (Netlify DB, injected automatically by Netlify)
 *  - POSTGRES_URL           (Vercel Postgres / Supabase integration naming)
 *  - NEON_DATABASE_URL      (Neon integration naming)
 */
export function resolveDatabaseUrl(): string | undefined {
  for (const name of DB_URL_VARS) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Netlify site context for dashboard deep links (undefined outside Netlify). */
export function netlifySite(): { name: string; url?: string } | null {
  const name = process.env.SITE_NAME;
  if (name) return { name, url: process.env.URL };
  if (process.env.URL) {
    try {
      const host = new URL(process.env.URL).hostname; // e.g. my-erp.netlify.app
      const candidate = host.split(".")[0];
      if (candidate && host.endsWith(".netlify.app")) return { name: candidate, url: process.env.URL };
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

/** Human-readable, password-free description of the configured database (for status screens). */
export function describeDatabase(): string | null {
  const url = resolveDatabaseUrl();
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.username ? `${u.username}@` : ""}${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal", "db", "postgres"]);

/**
 * Hosted Postgres (Neon, Supabase, Netlify DB, RDS…) requires TLS. If the URL does not
 * specify `sslmode`/`ssl` itself we enable TLS for any non-local host. When the URL does
 * carry an `sslmode`, `pg` is left in charge so explicit settings always win.
 */
export function sslOption(url: string | undefined): PoolConfig["ssl"] | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.searchParams.has("sslmode") || u.searchParams.has("ssl")) return undefined;
    if (LOCAL_HOSTS.has(u.hostname) || u.hostname.endsWith(".local")) return undefined;
    return { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
}

function createPool(): Pool {
  const connectionString = resolveDatabaseUrl();
  const ssl = sslOption(connectionString);
  const config: PoolConfig = {
    connectionString,
    // Serverless-friendly sizing: each function instance keeps a few warm connections.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
    ...(ssl ? { ssl } : {}),
  };
  const p = new Pool(config);
  // Idle clients can be dropped by the provider (e.g. Neon auto-suspend). Without a
  // listener this would surface as an unhandled 'error' event and crash the process.
  p.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
  return p;
}

const globalForDb = globalThis as typeof globalThis & {
  __erpPgPool?: Pool;
};

// Reuse the pool across hot reloads (dev) and warm serverless invocations (prod).
export const pool = globalForDb.__erpPgPool ?? createPool();
globalForDb.__erpPgPool = pool;

export const db = drizzle(pool);

/* ------------------------------------------------------------------ */
/*  Where the active URL came from + late re-pointing                  */
/* ------------------------------------------------------------------ */
let urlSource: "env" | "stored" | null = resolveDatabaseUrl() ? "env" : null;

export function getDbUrlSource(): "env" | "stored" | null {
  return urlSource;
}

/**
 * Point the (not-yet-connected) pool at a URL discovered after module load
 * (e.g. loaded from Netlify Blobs by the setup wizard). pg reads the pool
 * options when it creates its first client, so this is safe as long as no
 * client has been created yet.
 */
export function repointPool(url: string): boolean {
  if (pool.totalCount > 0) return false;
  const opts = (pool as unknown as { options?: PoolConfig }).options;
  if (!opts) return false;
  opts.connectionString = url;
  const ssl = sslOption(url);
  if (ssl) opts.ssl = ssl;
  else delete opts.ssl;
  urlSource = "stored";
  return true;
}

/** Adopt a connection string discovered at runtime (stored config). */
export function adoptDatabaseUrl(url: string, source: "env" | "stored"): void {
  if (source === "stored") process.env.DATABASE_URL = url;
  urlSource = source;
  repointPool(url);
}
