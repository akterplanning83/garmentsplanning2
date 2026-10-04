"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { saveEntity } from "@/lib/actions";
import type { ActionResult, FieldDef } from "@/lib/entities";

type Props = {
  entity: string;
  title: string;
  fields: FieldDef[];
  initial?: Record<string, unknown> | null;
  trigger?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "icon" | "link";
  size?: "sm" | "md" | "lg";
  action?: (fd: FormData) => Promise<ActionResult>;
  hidden?: Record<string, string | number>;
  submitLabel?: string;
  description?: string;
};

function valueOf(initial: Record<string, unknown> | null | undefined, f: FieldDef): string {
  const raw = initial?.[f.name];
  if (raw === undefined || raw === null) {
    if (f.defaultValue === undefined || f.defaultValue === null) return "";
    return String(f.defaultValue);
  }
  if (typeof raw === "boolean") return raw ? "true" : "false";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw);
}

export default function CrudModal({ entity, title, fields, initial, trigger, variant = "primary", size = "md", action, hidden, submitLabel, description }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = Boolean(initial && (initial as { id?: number }).id);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const fn = action ?? ((f: FormData) => saveEntity(entity, f));
      const res = await fn(fd);
      if (res && res.ok === false) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const triggerClass =
    variant === "icon"
      ? "btn btn-ghost btn-xs"
      : variant === "link"
        ? "text-brand text-xs font-semibold hover:underline"
        : `btn btn-${variant} btn-sm`;

  const width = size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-md" : "max-w-xl";

  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)} title={title}>
        {trigger ?? (isEdit ? "✎" : `+ ${title}`)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className={`animate-in w-full ${width} rounded-2xl bg-white shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{isEdit ? `Edit ${title}` : title}</h3>
                {description && <p className="text-xs text-slate-500">{description}</p>}
              </div>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={onSubmit} className="px-5 py-4">
              {isEdit && <input type="hidden" name="id" value={String((initial as { id: number }).id)} />}
              {hidden &&
                Object.entries(hidden).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={String(v)} />
                ))}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const v = valueOf(initial, f);
                  const cls = f.span === 2 ? "sm:col-span-2" : "";
                  if (f.type === "hidden") return <input key={f.name} type="hidden" name={f.name} defaultValue={v} />;
                  if (f.type === "checkbox") {
                    return (
                      <label key={f.name} className={`flex items-center gap-2 pt-5 text-sm text-slate-700 ${cls}`}>
                        <input type="hidden" name={f.name} value="false" />
                        <input type="checkbox" name={f.name} value="true" defaultChecked={v === "true"} className="h-4 w-4 accent-[var(--brand)]" />
                        {f.label}
                      </label>
                    );
                  }
                  return (
                    <label key={f.name} className={cls}>
                      <span className="lbl">
                        {f.label}
                        {f.required && <span className="text-red-500"> *</span>}
                      </span>
                      {f.type === "select" ? (
                        <select name={f.name} defaultValue={v} required={f.required} className="inp">
                          {!f.required && <option value="">—</option>}
                          {f.required && v === "" && <option value="">Select…</option>}
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea name={f.name} defaultValue={v} required={f.required} placeholder={f.placeholder} rows={3} className="inp" />
                      ) : f.type === "color" ? (
                        <div className="flex items-center gap-2">
                          <input type="color" name={f.name} defaultValue={v || "#0f766e"} className="h-9 w-12 cursor-pointer rounded border border-slate-300" />
                          <span className="text-xs text-slate-500">Pick a color</span>
                        </div>
                      ) : (
                        <input
                          type={f.type ?? "text"}
                          name={f.name}
                          defaultValue={v}
                          required={f.required}
                          step={f.step ?? (f.type === "number" ? "any" : undefined)}
                          min={f.min}
                          placeholder={f.placeholder}
                          className="inp"
                        />
                      )}
                      {f.help && <span className="mt-1 block text-[11px] text-slate-400">{f.help}</span>}
                    </label>
                  );
                })}
              </div>
              {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                  {pending ? "Saving…" : submitLabel ?? (isEdit ? "Save changes" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
