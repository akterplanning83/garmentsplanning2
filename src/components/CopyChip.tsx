"use client";

import { useState } from "react";

export default function CopyChip({ text, mono = false }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked – fall back to a selectable prompt
      window.prompt("Copy this value:", text);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${mono ? "font-mono font-normal" : ""}`}
    >
      <span className="truncate">{text}</span>
      <span className={`shrink-0 text-[10px] ${copied ? "text-emerald-600" : "text-slate-400"}`}>{copied ? "✓ copied" : "⧉"}</span>
    </button>
  );
}
