"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="card card-p">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Something went wrong</div>
        <h1 className="mt-1 text-lg font-bold text-slate-900">This page could not be loaded</h1>
        <p className="mt-2 text-sm text-slate-600">
          The request failed on the server. This is usually temporary (for example the database was waking up). You can retry, or go back to the dashboard.
        </p>
        {error.digest && <p className="mt-2 text-[11px] text-slate-400">Reference: {error.digest}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary btn-sm">
            Dashboard
          </Link>
          <a href="/api/health" className="btn btn-ghost btn-sm">
            Health check
          </a>
        </div>
      </div>
    </div>
  );
}
