import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Persistent, site-scoped storage for the database connection string so the app can be
 * configured from its own setup screen (no Netlify dashboard / redeploy needed).
 *
 *  - On Netlify the value lives in **Netlify Blobs** (site-scoped server-side store that
 *    needs zero configuration and survives deploys and cold starts).
 *  - Anywhere else (local dev, VPS) it is written to `.data/db-config.json` (git-ignored).
 *
 * The value is only ever read/written on the server. It is treated as a secret: never
 * logged, never sent to the browser, and masked in the health endpoint.
 */

const BLOB_STORE = "erp-config";
const BLOB_KEY = "database-url";

let cache: string | null | undefined; // undefined = not loaded yet

function filePath(): string {
  return join(process.cwd(), ".data", "db-config.json");
}

async function readFromBlobs(): Promise<string | null> {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(BLOB_STORE);
    const v = (await store.get(BLOB_KEY)) as unknown as string | null;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch (err) {
    console.warn("[dbconfig] blobs read failed:", (err as Error).message);
    return null;
  }
}

function readFromFile(): string | null {
  try {
    const raw = readFileSync(filePath(), "utf8");
    const parsed = JSON.parse(raw) as { url?: string };
    return parsed.url?.trim() || null;
  } catch {
    return null;
  }
}

export async function getStoredDatabaseUrl(force = false): Promise<string | null> {
  if (!force && cache !== undefined) return cache;
  let val: string | null = null;
  if (process.env.NETLIFY) val = await readFromBlobs();
  if (!val) val = readFromFile();
  cache = val;
  return val;
}

function writeToFile(url: string): { ok: boolean; error?: string } {
  try {
    mkdirSync(join(process.cwd(), ".data"), { recursive: true });
    writeFileSync(filePath(), JSON.stringify({ url, savedAt: new Date().toISOString() }, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setStoredDatabaseUrl(url: string): Promise<{ ok: boolean; where: "blobs" | "file"; error?: string }> {
  // Preferred: Netlify Blobs (durable across deploys). Fallback: local config file,
  // so the wizard also works on VPS/dev boxes and in unusual runtimes.
  if (process.env.NETLIFY) {
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore(BLOB_STORE);
      await store.set(BLOB_KEY, url);
      cache = url;
      return { ok: true, where: "blobs" };
    } catch (err) {
      const fb = writeToFile(url);
      if (fb.ok) {
        cache = url;
        return { ok: true, where: "file" };
      }
      return { ok: false, where: "blobs", error: `Blobs: ${(err as Error).message} | file: ${fb.error}` };
    }
  }
  const fb = writeToFile(url);
  if (fb.ok) {
    cache = url;
    return { ok: true, where: "file" };
  }
  return { ok: false, where: "file", error: fb.error };
}

/**
 * Copy the stored connection string into process.env (memory only) so the regular
 * resolution order picks it up. Returns the source actually in use afterwards.
 */
export async function hydrateDatabaseUrlFromStore(): Promise<"env" | "stored" | null> {
  const fromEnv = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.NEON_DATABASE_URL?.trim();
  if (fromEnv) return "env";
  const stored = await getStoredDatabaseUrl();
  if (stored) {
    process.env.DATABASE_URL = stored;
    return "stored";
  }
  return null;
}
