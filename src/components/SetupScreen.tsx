import type { DbStatus } from "@/db/bootstrap";
import { describeDatabase, detectedDbVars, netlifySite } from "@/db";
import CopyChip from "./CopyChip";
import ConnectWizard from "./ConnectWizard";

const TITLES: Record<Exclude<DbStatus, { ok: true }>["code"], string> = {
  missing_url: "Database connection not configured",
  connection: "Cannot connect to the database",
  schema: "Database schema could not be created",
};

export default function SetupScreen({ status }: { status: Exclude<DbStatus, { ok: true }> }) {
  const target = describeDatabase();
  const vars = detectedDbVars();
  const anyVar = vars.some((v) => v.present);
  const site = netlifySite();
  const onNetlify = Boolean(process.env.NETLIFY) || Boolean(site);

  const links = site
    ? {
        db: `https://app.netlify.com/sites/${site.name}/extensions`,
        env: `https://app.netlify.com/sites/${site.name}/configuration/environment-variables`,
        deploys: `https://app.netlify.com/sites/${site.name}/deploys`,
      }
    : {
        db: "https://app.netlify.com/start",
        env: "https://app.netlify.com",
        deploys: "https://app.netlify.com",
      };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Garments Planning ERP · Setup</div>
          <h1 className="mt-1 text-lg font-bold text-slate-900">{TITLES[status.code]}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {status.code === "missing_url"
              ? "The app is running fine — it only needs a PostgreSQL database to store your planning data. This takes about 2 minutes on Netlify."
              : "The app is running, but the configured database is not reachable. Details below."}
          </p>
        </div>

        <div className="space-y-5 px-6 py-5 text-sm text-slate-700">
          {/* -------- detected environment -------- */}
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">1 · Connection variables detected on this server</h2>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {vars.map((v) => (
                <li key={v.name} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <code className="font-semibold text-slate-700">{v.name}</code>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${v.present ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {v.present ? "set" : "not set"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-slate-500">
              {anyVar
                ? "A variable is set, so the problem is the connection itself (see the error below)."
                : "None of these exist yet on this deployment — that is exactly why you see this screen. Add one below."}
            </p>
            {status.code !== "missing_url" && target && (
              <p className="mt-2 text-xs">
                Connecting to <code className="rounded bg-slate-100 px-1">{target}</code>
              </p>
            )}
            {status.code !== "missing_url" && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{status.message}</pre>
            )}
          </section>

          {/* -------- in-app wizard -------- */}
          {(status.code === "missing_url" || status.code === "connection") && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">2 · Fastest fix — connect from this page</h2>
              <ConnectWizard />
            </section>
          )}

          {/* -------- fix on Netlify -------- */}
          {status.code === "missing_url" && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">3 · Or fix it {onNetlify ? "on this Netlify site" : "on Netlify"} (option A – no paste needed)</h2>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Open{" "}
                  <a href={links.db} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Site → Extensions
                  </a>{" "}
                  and install <b>Neon Postgres</b> (“Add database”). Netlify creates a managed database and injects{" "}
                  <code className="rounded bg-slate-100 px-1">NETLIFY_DATABASE_URL</code> automatically — this app reads it, so there is nothing to paste.
                </li>
                <li>
                  Open{" "}
                  <a href={links.deploys} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Deploys
                  </a>{" "}
                  → <b>Trigger deploy → Deploy site</b>. Environment variables are applied at deploy time, so one redeploy is required.
                </li>
                <li>Reload this page — all tables are created automatically, then click <b>Load demo data</b> on the dashboard.</li>
              </ol>

              <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Option B – same database via environment variable instead</h2>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Create a free Postgres and copy the <b>pooled</b> connection string. Supabase: use the <i>Session pooler (IPv4)</i> string, not the direct IPv6 host.
                </li>
                <li>
                  In{" "}
                  <a href={links.env} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Site configuration → Environment variables
                  </a>{" "}
                  create <CopyChip text="DATABASE_URL" /> with the value:
                  <div className="mt-1.5">
                    <CopyChip text="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require" mono />
                  </div>
                </li>
                <li>
                  <a href={links.deploys} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Trigger a new deploy
                  </a>{" "}
                  (required after adding variables), then reload this page.
                </li>
              </ol>
            </section>
          )}

          {status.code === "connection" && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">4 · Fix the connection</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-xs">
                <li>
                  <b>ENOTFOUND / ETIMEDOUT:</b> Supabase → switch to the Session-pooler IPv4 host. Neon → check the project is not paused/deleted. Corporate DB → allow Netlify IPs or enable a public pooler.
                </li>
                <li>
                  <b>password authentication failed:</b> re-copy the string; URL-encode special characters in the password (e.g. <code>@</code> → <code>%40</code>).
                </li>
                <li>
                  <b>ssl / certificate errors:</b> append <code className="rounded bg-slate-100 px-1">?sslmode=require</code> to the URL.
                </li>
                <li>
                  After editing the variable in{" "}
                  <a href={links.env} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Environment variables
                  </a>
                  , you must{" "}
                  <a href={links.deploys} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    trigger a redeploy
                  </a>
                  .
                </li>
              </ul>
            </section>
          )}

          {status.code === "schema" && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">4 · Fix permissions</h2>
              <p className="text-xs">
                The database is reachable but table creation was refused. Either grant <code className="rounded bg-slate-100 px-1">CREATE</code> on the schema to the
                connecting user, or push the schema once from your machine:{" "}
                <CopyChip text='DATABASE_URL="postgresql://…" npx drizzle-kit push --config drizzle.config.prod.ts' mono />
              </p>
            </section>
          )}

          {/* -------- bangla -------- */}
          <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">বাংলায় সংক্ষেপে</h2>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
              <li>
                Netlify-তে <b>Extensions</b> খুলে <b>Neon Postgres → Add database</b> চাপুন (কোনো কপি-পেস্ট লাগবে না), অথবা Neon/Supabase-এর connection string{" "}
                <code className="rounded bg-white px-1">DATABASE_URL</code> নামে Environment variable-এ দিন।
              </li>
              <li>
                তারপর <b>Deploys → Trigger deploy</b> করুন (variable যোগ করার পর redeploy বাধ্যতামূলক)।
              </li>
              <li>সাইট রিলোড করলেই table নিজে তৈরি হয়ে যাবে; Dashboard-এ <b>Load demo data</b> চেপে পুরো ERP ঘুরে দেখুন।</li>
            </ol>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <a href="/" className="btn btn-primary btn-sm">
              Retry connection
            </a>
            <a href="/api/health" className="btn btn-secondary btn-sm">
              View health JSON
            </a>
            {site && (
              <span className="text-xs text-slate-400">
                Netlify site: <code>{site.name}</code>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
