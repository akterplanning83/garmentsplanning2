// Drizzle Kit config that targets the database from the environment.
// The default drizzle.config.json is for the local sandbox database.
//
// Usage (from your machine or CI, against production):
//   DATABASE_URL="postgresql://..." npx drizzle-kit push --config drizzle.config.prod.ts
//
// Normally not needed: the app bootstraps its own schema on first start.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  throw new Error("Set DATABASE_URL (or NETLIFY_DATABASE_URL) before running drizzle-kit with this config.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
