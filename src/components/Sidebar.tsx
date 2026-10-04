"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { key: string; label: string; href: string; icon: string; group: string };

export default function Sidebar({
  items,
  companyName,
  shortName,
  style,
}: {
  items: Item[];
  companyName: string;
  shortName: string;
  style: "dark" | "light";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = Array.from(new Set(items.map((i) => i.group)));
  const dark = style === "dark";

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 scroll-thin">
      {groups.map((g) => (
        <div key={g} className="mb-4">
          <div className={`px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`}>{g}</div>
          {items
            .filter((i) => i.group === g)
            .map((i) => {
              const active = isActive(i.href);
              return (
                <Link
                  key={i.key}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors mb-0.5 ${
                    active
                      ? "bg-brand text-white shadow-sm"
                      : dark
                        ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="w-5 text-center text-base leading-none opacity-90">{i.icon}</span>
                  <span>{i.label}</span>
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );

  const shell = `flex h-full w-64 flex-col border-r ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`;

  return (
    <>
      {/* mobile top bar */}
      <div className={`md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 ${dark ? "bg-slate-900 text-white" : "bg-white border-b border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-xs font-bold text-white">{shortName.slice(0, 3)}</span>
          <span className="font-semibold text-sm">{companyName}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          ☰
        </button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className={shell + " h-full"}>{nav}</div>
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}
      <aside className={`hidden md:flex ${shell} fixed inset-y-0 left-0 z-20`}>
        <div className={`flex items-center gap-3 px-4 py-4 border-b ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-sm font-bold text-white shadow">{shortName.slice(0, 3)}</span>
          <div className="min-w-0">
            <div className={`truncate text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{companyName}</div>
            <div className={`text-[11px] ${dark ? "text-slate-400" : "text-slate-500"}`}>Garments Planning ERP</div>
          </div>
        </div>
        {nav}
        <div className={`px-4 py-3 text-[11px] border-t ${dark ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"}`}>
          v1.0 · Customize in Settings
        </div>
      </aside>
    </>
  );
}
