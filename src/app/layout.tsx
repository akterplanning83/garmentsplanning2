import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SetupScreen from "@/components/SetupScreen";
import { getDbStatus } from "@/db/bootstrap";
import { getSettings, MODULE_LIST } from "@/lib/settings";
import { fmtDate, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Garments Planning ERP",
  description: "Production planning, capacity, TNA, materials and shipment management for apparel manufacturers.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Verify the database (and create the schema on first start). If it is not
  // available we render a guided setup screen instead of failing every page.
  const status = await getDbStatus();
  if (!status.ok) {
    return (
      <html lang="en">
        <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
          <SetupScreen status={status} />
        </body>
      </html>
    );
  }

  const s = await getSettings();
  const items = MODULE_LIST.filter((m) => s.modules[m.key] !== false);

  return (
    <html lang="en" style={{ ["--brand" as string]: s.theme.primary }} data-density={s.theme.density}>
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <Sidebar items={items} companyName={s.company.name} shortName={s.company.shortName || "ERP"} style={s.theme.sidebarStyle} />
        <div className="md:pl-64">
          <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-2.5 backdrop-blur md:flex">
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{s.company.name}</span> · {s.company.address}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>
                Currency: <b className="text-slate-700">{s.company.currency}</b>
              </span>
              <span title={s.company.timezone}>
                Today: <b className="text-slate-700">{fmtDate(today(), s.company.dateFormat)}</b>
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">PL</span>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
