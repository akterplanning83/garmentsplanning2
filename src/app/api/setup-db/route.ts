import { Pool } from "pg";
import { adoptDatabaseUrl, getDbUrlSource, sslOption } from "@/db";
import { pingDatabase } from "@/db/bootstrap";
import { setStoredDatabaseUrl } from "@/lib/dbconfig";

export const dynamic = "force-dynamic";

function normalize(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

/** Try a real connection (+ minimal write-capability probe) before accepting a URL. */
async function testConnection(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const pool = new Pool({
    connectionString: url,
    ssl: sslOption(url),
    max: 1,
    connectionTimeoutMillis: 12_000,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("select 1");
      // The ERP needs DDL + DML rights; probe both cheaply with a temp table.
      await client.query("create temporary table __erp_probe (id int)");
      await client.query("insert into __erp_probe values (1)");
      await client.query("drop table __erp_probe");
    } finally {
      client.release();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function GET() {
  const status = await pingDatabase();
  return Response.json(
    {
      allowed: !status.ok,
      reason: status.ok ? "already-configured" : status.code,
      source: getDbUrlSource(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const status = await pingDatabase();
  if (status.ok) {
    return Response.json({ ok: false, error: "A working database is already configured. Change it via environment variables or by clearing the stored configuration." }, { status: 403 });
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? normalize(body.url) : "";
  if (!url) return Response.json({ ok: false, error: "Connection string is required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ ok: false, error: "That does not look like a connection string (expected postgresql://user:pass@host/db)" }, { status: 400 });
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    return Response.json({ ok: false, error: `Unsupported protocol "${parsed.protocol}" – use a postgresql:// connection string` }, { status: 400 });
  }

  const test = await testConnection(url);
  if (!test.ok) {
    return Response.json({ ok: false, step: "connect", error: test.error }, { status: 422 });
  }

  const saved = await setStoredDatabaseUrl(url);
  if (!saved.ok) {
    return Response.json({ ok: false, step: "store", error: saved.error }, { status: 500 });
  }

  adoptDatabaseUrl(url, "stored");
  const after = await pingDatabase();
  if (!after.ok) {
    return Response.json({ ok: false, step: "schema", error: after.message }, { status: 500 });
  }
  return Response.json({ ok: true, storedIn: saved.where });
}

/** Remove the stored value again (e.g. to switch databases) – only while unhealthy or via explicit flag. */
export async function DELETE() {
  const { getStoredDatabaseUrl } = await import("@/lib/dbconfig");
  const current = await getStoredDatabaseUrl();
  if (!current) return Response.json({ ok: false, error: "Nothing stored" }, { status: 404 });
  const saved = await setStoredDatabaseUrl("");
  if (!saved.ok) return Response.json({ ok: false, error: saved.error }, { status: 500 });
  return Response.json({ ok: true, note: "Stored value cleared. Set a new one, or configure DATABASE_URL and redeploy." });
}
