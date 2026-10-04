# Garments Planning ERP

Production planning ERP for apparel manufacturers — orders, styles & SMV, line/capacity planning board, Time & Action calendars, BOM/materials, daily production & efficiency, shipments, reports, and a fully customizable settings area (company, planning rules, factories & lines, master data, TNA templates, custom fields, statuses, theme, module toggles).

**Stack:** Next.js 16 (App Router, Server Actions) · PostgreSQL · Drizzle ORM · Tailwind CSS v4

---

## Deploy to Netlify (5 minutes)

### 1. Push the code to Git
Push this repository to GitHub / GitLab / Bitbucket. `.env` is git-ignored — never commit real connection strings.

### 2. Create the site
Netlify → **Add new site → Import an existing project** → pick the repo.
`netlify.toml` already sets everything (build `npm run build`, publish `.next`, Node 22, Next.js runtime), so just click **Deploy**.

### 3. Add a PostgreSQL database
Pick one:

| Provider | How | Env var |
|---|---|---|
| **Netlify DB** (Neon, easiest) | Site → **Extensions → Neon → Add database** | `NETLIFY_DATABASE_URL` is injected automatically — nothing to copy |
| **Neon** (neon.tech) | Create project → *Connect* → copy the **pooled** connection string | `DATABASE_URL` |
| **Supabase** | Project → *Connect* → use the **Session pooler** (IPv4) string, not the direct IPv6 host | `DATABASE_URL` |
| Any other Postgres | Ensure it is reachable from the internet with TLS | `DATABASE_URL` |

For `DATABASE_URL`: **Site configuration → Environment variables → Add a variable**
```
DATABASE_URL = postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

### 4. Redeploy
**Deploys → Trigger deploy → Deploy site.** On first start the app **creates all tables itself** (idempotent, lock-protected — see `src/db/bootstrap.ts`). No `drizzle-kit push`, no SQL console needed.

### 5. First run
Open the site → the dashboard offers **Load demo data** (2 units, 12 lines, 7 buyers, 10 styles, 14 orders with TNA / BOM / plans / production). Or start from a blank database and configure **Settings → Factories & Lines**, master data and buyers.

### Alternative: connect from the site itself (no dashboard, no redeploy)
If the site shows the setup screen, you can paste a connection string straight into it ("**Connect now**" card). The server tests the connection (read + write + DDL probe), stores it securely — in **Netlify Blobs** on Netlify (site-scoped, survives deploys and cold starts) or `.data/db-config.json` elsewhere (git-ignored) — creates all tables and opens the dashboard. The wizard is only active while no working database is configured; afterwards the endpoint refuses changes (403).

Check `https://<your-site>/api/health` any time — it reports database status, schema readiness and the active timezone.

---

## What was hardened for serverless hosting

- **Self-bootstrapping schema** — `src/instrumentation.ts` runs on every cold start; the data layer also guards itself, so the first request after a fresh deploy works.
- **Guided setup screen** instead of a crash when the database is missing/unreachable (with the exact error and fix steps).
- **Connection handling** — automatic TLS for hosted Postgres, small pool per function instance, idle-error handler (Neon auto-suspend safe), pool reuse across warm invocations, lazy connection (the build never needs a database).
- **Env var conventions** — `DATABASE_URL`, `NETLIFY_DATABASE_URL` (Netlify DB) and `POSTGRES_URL` are all recognised.
- **Timezone-correct "today"** — servers run in UTC; the factory timezone (Settings → Company, default `Asia/Dhaka`) drives planning, TNA and production dates.
- **Error boundaries** (`error.tsx`, `global-error.tsx`, `not-found.tsx`) with retry, and a JSON health endpoint for monitoring.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes* | PostgreSQL connection string (`?sslmode=require` recommended for hosted DBs) |
| `NETLIFY_DATABASE_URL` | * | Injected by Netlify DB; used automatically when `DATABASE_URL` is not set |
| `DATABASE_POOL_MAX` | no | Pooled connections per server instance (default 5) |

\* one of the two.

---

## Local development

```bash
cp .env.example .env         # point DATABASE_URL at a local or hosted Postgres
npm install
npm run dev                  # tables are created automatically on first start
```
Optional: load the demo dataset from the dashboard, or `npx tsx src/db/seed.ts`.

## Schema management

The schema lives in `src/db/schema.ts`. The runtime bootstrap script `src/db/schema-sql.ts` is generated from it — after changing the schema, regenerate it:

```bash
npx drizzle-kit generate --dialect postgresql --schema ./src/db/schema.ts --out /tmp/drz --name change
# turn the SQL into idempotent statements (CREATE TABLE IF NOT EXISTS / guarded constraints) in src/db/schema-sql.ts
```
or push directly to a database with Drizzle Kit:
```bash
DATABASE_URL="postgresql://..." npx drizzle-kit push --config drizzle.config.prod.ts
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Setup screen: **“Database connection not configured”** (first deploy) | Expected — `.env` is never committed. The screen itself lists which variables Netlify sees and links straight to the fix: **Extensions → Neon → Add database** (no paste needed), then **Deploys → Trigger deploy**. Alternatively add `DATABASE_URL` under *Site configuration → Environment variables* and redeploy. Env vars only apply to new deploys, so a redeploy after adding them is mandatory |
| Setup screen: *cannot connect* with `ENOTFOUND`/`ETIMEDOUT` | Supabase: use the pooler (IPv4) host. Neon: make sure the project is not deleted/paused. Check for firewall / IP allow-lists |
| `password authentication failed` | Re-copy the connection string; URL-encode special characters in the password |
| First request after idle is slow | Free-tier databases suspend when idle; the first query wakes them (1–3 s) |
| Netlify function timeout during **Load demo data** | Retry once the database is warm; the operation is transactional per table and safe to rerun |

---

## Bengali quick guide (সংক্ষিপ্ত গাইড)

1. কোডটা GitHub-এ push করুন → Netlify-তে **Import project** → Deploy।
2. ডাটাবেস: Netlify Extensions থেকে **Neon → Add database** দিলে আর কিছু করতে হবে না; অথবা Neon/Supabase-এর connection string `DATABASE_URL` নামে Environment variable-এ দিন।
3. **Trigger deploy** করুন — প্রথম start-এই সব table নিজে থেকে তৈরি হবে।
4. Dashboard-এ **Load demo data** চাপুন, তারপর **Settings** থেকে কোম্পানি, লাইন, buyer, TNA template, custom field ইত্যাদি নিজের মতো সাজিয়ে নিন।
