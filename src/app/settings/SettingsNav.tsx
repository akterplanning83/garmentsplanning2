"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/settings", label: "General & Planning" },
  { href: "/settings/appearance", label: "Appearance & Modules" },
  { href: "/settings/lines", label: "Factories & Lines" },
  { href: "/settings/master", label: "Master Data" },
  { href: "/settings/tna", label: "TNA Templates" },
  { href: "/settings/fields", label: "Custom Fields & Statuses" },
  { href: "/settings/data", label: "Data" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link key={i.href} href={i.href} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
