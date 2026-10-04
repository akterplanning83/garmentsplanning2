"use client";

import { useState } from "react";

type State = { kind: "idle" } | { kind: "testing" } | { kind: "error"; step?: string; message: string } | { kind: "done"; where: string };

export default function ConnectWizard() {
  const [url, setUrl] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setState({ kind: "error", message: "Paste the connection string first." });
      return;
    }
    setState({ kind: "testing" });
    try {
      const res = await fetch("/api/setup-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; step?: string; storedIn?: string };
      if (data.ok) {
        setState({ kind: "done", where: data.storedIn === "blobs" ? "Netlify Blobs (site-scoped, survives deploys)" : "server config file" });
        setTimeout(() => {
          window.location.href = "/";
        }, 1200);
      } else {
        setState({ kind: "error", step: data.step, message: data.error ?? "Connection failed" });
      }
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
      <h2 className="text-sm font-bold text-slate-800">Connect now — paste your connection string</h2>
      <p className="mt-1 text-xs text-slate-600">
        Fastest path, no Netlify dashboard and no redeploy: create a free database at{" "}
        <a className="font-semibold text-brand underline" href="https://neon.tech" target="_blank" rel="noreferrer">
          neon.tech
        </a>{" "}
        or{" "}
        <a className="font-semibold text-brand underline" href="https://supabase.com" target="_blank" rel="noreferrer">
          supabase.com
        </a>
        , copy the <b>pooled</b> connection string, paste it below. The app tests it (read + write + table creation), saves it securely on the server, creates all
        tables and opens the dashboard.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
            autoComplete="off"
            spellCheck={false}
            className="inp font-mono text-xs"
            disabled={state.kind === "testing"}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
            {show ? "hide" : "show"}
          </button>
        </div>
        <button type="submit" className="btn btn-primary" disabled={state.kind === "testing"}>
          {state.kind === "testing" ? "Testing & connecting…" : "Test & connect"}
        </button>
      </div>
      {state.kind === "error" && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.step === "connect" && <b>Connection failed: </b>}
          {state.step === "store" && <b>Saving failed: </b>}
          {state.step === "schema" && <b>Connected, but schema creation failed: </b>}
          {state.message}
          {state.step === "connect" && /ENOTFOUND|ETIMEDOUT|getaddrinfo/.test(state.message) && (
            <span className="mt-1 block text-red-600">Hint: use the pooled / IPv4 host (Supabase: “Session pooler”), and make sure the project is not paused.</span>
          )}
          {state.step === "connect" && /password authentication/.test(state.message) && (
            <span className="mt-1 block text-red-600">Hint: URL-encode special characters in the password (e.g. @ → %40).</span>
          )}
        </div>
      )}
      {state.kind === "done" && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Connected and saved in {state.where}. Opening the dashboard…
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        The string is sent once over HTTPS directly to your site’s server and stored there (never in the browser, never in git). You can only use this wizard while
        no working database is configured.
      </p>
    </form>
  );
}
