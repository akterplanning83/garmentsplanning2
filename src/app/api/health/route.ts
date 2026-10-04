import { pingDatabase } from "@/db/bootstrap";
import { describeDatabase, detectedDbVars, getDbUrlSource, isDatabaseConfigured, netlifySite } from "@/db";
import { getActiveTimeZone, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await pingDatabase();
  const body = {
    ok: db.ok,
    database: {
      configured: isDatabaseConfigured(),
      target: describeDatabase(),
      envVars: Object.fromEntries(detectedDbVars().map((v) => [v.name, v.present])),
      urlSource: getDbUrlSource(),
      netlifySite: netlifySite()?.name ?? null,
      ...(db.ok ? { status: "ready" } : { status: db.code, error: db.message }),
    },
    timezone: getActiveTimeZone(),
    today: today(),
    time: new Date().toISOString(),
    runtime: process.env.NETLIFY ? "netlify" : process.env.NODE_ENV,
  };
  return Response.json(body, { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
