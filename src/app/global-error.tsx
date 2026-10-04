"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f1f5f9", margin: 0 }}>
        <div style={{ maxWidth: 560, margin: "80px auto", background: "white", borderRadius: 14, border: "1px solid #e2e8f0", padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#dc2626" }}>Application error</div>
          <h1 style={{ fontSize: 18, margin: "6px 0 8px", color: "#0f172a" }}>The application failed to render</h1>
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
            Please retry. If this keeps happening, check the database connection at <a href="/api/health">/api/health</a> and the Netlify function logs.
          </p>
          {error.digest && <p style={{ fontSize: 11, color: "#94a3b8" }}>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 12, background: "#0f766e", color: "white", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
