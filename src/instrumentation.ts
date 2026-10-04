/**
 * Next.js instrumentation hook – runs once when a server instance boots
 * (locally with `next start`, and on every serverless cold start on Netlify).
 * We use it to make sure the database schema exists before the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSchema } = await import("./db/bootstrap");
  try {
    await ensureSchema();
  } catch (err) {
    // Do not crash the server: the root layout renders a setup screen with guidance,
    // and ensureSchema() is retried on the next request.
    console.error("[db] schema bootstrap deferred:", (err as Error).message);
  }
}
