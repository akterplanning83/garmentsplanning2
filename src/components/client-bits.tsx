"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { deleteEntity } from "@/lib/actions";
import type { ActionResult } from "@/lib/entities";

export function DeleteButton({ entity, id, label, redirectTo, confirmText }: { entity: string; id: number; label?: string; redirectTo?: string; confirmText?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className={label ? "btn btn-danger btn-sm" : "btn btn-ghost btn-xs text-red-600"}
      disabled={pending}
      title="Delete"
      onClick={() => {
        if (!confirm(confirmText ?? "Delete this record? This cannot be undone.")) return;
        start(async () => {
          const res = await deleteEntity(entity, id);
          if (!res.ok) {
            alert(res.error ?? "Delete failed");
            return;
          }
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        });
      }}
    >
      {pending ? "…" : label ?? "🗑"}
    </button>
  );
}

/** Select that submits its parent form on change (used with server-action forms) */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

/** Button that invokes a server action (with optional confirm) and refreshes */
export function ActionButton({
  action,
  children,
  confirmText,
  className = "btn btn-secondary btn-sm",
  successMessage,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirmText?: string;
  className?: string;
  successMessage?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          setMsg(null);
          start(async () => {
            const res = await action();
            setMsg(res.ok ? (successMessage ?? "Done") : res.error ?? "Failed");
            router.refresh();
          });
        }}
      >
        {pending ? "Working…" : children}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}

/** Form wrapper that shows a saved indicator after a server action completes */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setMsg(null);
        start(async () => {
          const res = await action(fd);
          setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: res.error ?? "Failed" });
          router.refresh();
        });
      }}
    >
      {children}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

/** Full-page form shell using useActionState (supports server-side redirect on success) */
export function FormShell({
  action,
  children,
  submitLabel = "Save",
  className = "",
  cancelHref,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(async (_prev: ActionResult | null, fd: FormData) => action(fd), null as ActionResult | null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && !state.ok && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {cancelHref && (
          <a href={cancelHref} className="btn btn-secondary btn-sm">
            Cancel
          </a>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Editable list of {key,label,color} rows (statuses, priorities) */
export function ListEditor({ initial }: { initial: { key: string; label: string; color: string }[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
          <input name="key" defaultValue={r.key} placeholder="key" className="inp inp-sm font-mono" required />
          <input name="label" defaultValue={r.label} placeholder="Label" className="inp inp-sm" required />
          <input type="color" name="color" defaultValue={r.color} className="h-8 w-10 cursor-pointer rounded border border-slate-300" />
          <button type="button" className="btn btn-ghost btn-xs text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRows([...rows, { key: "", label: "", color: "#64748b" }])}>
        + Add row
      </button>
    </div>
  );
}

/** Simple inline row form for quick updates (renders children + submit) */
export function InlineForm({ action, children, submitLabel = "Save", className = "" }: { action: (fd: FormData) => Promise<ActionResult>; children: ReactNode; submitLabel?: string; className?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className={`inline-flex items-center gap-1 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await action(fd);
          if (!res.ok) alert(res.error ?? "Failed");
          router.refresh();
        });
      }}
    >
      {children}
      <button type="submit" className="btn btn-secondary btn-xs" disabled={pending}>
        {pending ? "…" : submitLabel}
      </button>
    </form>
  );
}
