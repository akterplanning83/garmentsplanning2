import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { getLookups, getOrders, opts } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, today } from "@/lib/dates";
import { calcEfficiency, fmtNum, pct } from "@/lib/planning";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; line?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const T = today();
  const from = sp.from ?? addDays(T, -14);
  const to = sp.to ?? T;

  const [lk, orders, rows] = await Promise.all([
    getLookups(),
    getOrders(),
    db
      .select({
        id: schema.dailyProduction.id,
        date: schema.dailyProduction.date,
        lineId: schema.dailyProduction.lineId,
        orderId: schema.dailyProduction.orderId,
        process: schema.dailyProduction.process,
        targetQty: schema.dailyProduction.targetQty,
        producedQty: schema.dailyProduction.producedQty,
        rejectedQty: schema.dailyProduction.rejectedQty,
        manpower: schema.dailyProduction.manpower,
        workingHours: schema.dailyProduction.workingHours,
        remarks: schema.dailyProduction.remarks,
        smv: sql<number>`coalesce(${schema.orders.smv}, ${schema.styles.smv}, 0)`,
        orderNo: schema.orders.orderNo,
        buyerName: schema.buyers.name,
      })
      .from(schema.dailyProduction)
      .innerJoin(schema.orders, eq(schema.dailyProduction.orderId, schema.orders.id))
      .leftJoin(schema.styles, eq(schema.orders.styleId, schema.styles.id))
      .leftJoin(schema.buyers, eq(schema.orders.buyerId, schema.buyers.id))
      .where(and(gte(schema.dailyProduction.date, from), lte(schema.dailyProduction.date, to)))
      .orderBy(desc(schema.dailyProduction.date), schema.dailyProduction.lineId),
  ]);

  const list = sp.line ? rows.filter((r) => String(r.lineId) === sp.line) : rows;
  const produced = list.reduce((a, r) => a + r.producedQty, 0);
  const rejected = list.reduce((a, r) => a + r.rejectedQty, 0);
  const target = list.reduce((a, r) => a + r.targetQty, 0);
  const earned = list.reduce((a, r) => a + r.producedQty * Number(r.smv), 0);
  const avail = list.reduce((a, r) => a + r.manpower * r.workingHours * 60, 0);
  const eff = avail ? Math.round((earned / avail) * 1000) / 10 : 0;

  const activeOrders = orders.filter((o) => ["confirmed", "in_production"].includes(o.status));
  const lines = lk.lines.filter((l) => l.isActive);
  const fields: FieldDef[] = [
    { name: "date", label: "Date", type: "date", required: true, defaultValue: T },
    { name: "lineId", label: "Line", type: "select", options: opts(lines, (l) => `${l.name} · ${l.factoryName ?? ""}`), required: true },
    { name: "orderId", label: "Order", type: "select", options: activeOrders.map((o) => ({ value: String(o.id), label: `${o.orderNo} · ${o.buyerName} · ${o.styleName}` })), required: true, span: 2 },
    { name: "process", label: "Process", type: "select", options: lk.processes.map((p) => ({ value: p.name, label: p.name })), defaultValue: "Sewing" },
    { name: "targetQty", label: "Target", type: "number" },
    { name: "producedQty", label: "Produced (good pcs)", type: "number", required: true },
    { name: "rejectedQty", label: "Rejected", type: "number", defaultValue: 0 },
    { name: "manpower", label: "Manpower (op + helper)", type: "number", required: true },
    { name: "workingHours", label: "Hours worked", type: "number", step: "0.5", defaultValue: s.planning.workingHoursPerDay },
    { name: "remarks", label: "Remarks", span: 2 },
  ];

  // daily trend
  const dates = Array.from(new Set(list.map((r) => r.date))).sort();
  const trend = dates.map((d) => {
    const rs = list.filter((r) => r.date === d);
    return { d, produced: rs.reduce((a, r) => a + r.producedQty, 0), target: rs.reduce((a, r) => a + r.targetQty, 0) };
  });
  const maxTrend = Math.max(1, ...trend.map((t) => Math.max(t.produced, t.target)));

  // line summary
  const lineSummary = lines
    .map((l) => {
      const rs = list.filter((r) => r.lineId === l.id);
      const p = rs.reduce((a, r) => a + r.producedQty, 0);
      const tg = rs.reduce((a, r) => a + r.targetQty, 0);
      const rj = rs.reduce((a, r) => a + r.rejectedQty, 0);
      const e = rs.reduce((a, r) => a + r.producedQty * Number(r.smv), 0);
      const av = rs.reduce((a, r) => a + r.manpower * r.workingHours * 60, 0);
      return { l, p, tg, rj, eff: av ? Math.round((e / av) * 1000) / 10 : 0, days: new Set(rs.map((r) => r.date)).size };
    })
    .filter((x) => x.p > 0);

  return (
    <>
      <PageHeader
        title="Daily Production"
        subtitle={`${fmtDate(from, s.company.dateFormat)} – ${fmtDate(to, s.company.dateFormat)}`}
        actions={
          <>
            <a href={`/api/export?report=production&from=${from}&to=${to}`} className="btn btn-secondary btn-sm">
              ⇩ Export CSV
            </a>
            <CrudModal entity="dailyProduction" title="Production entry" fields={fields} variant="primary" size="lg" />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Output" value={fmtNum(produced)} hint={`target ${fmtNum(target)} · ${pct(produced, target)}%`} icon="▲" color="#0f766e" />
        <StatCard label="Efficiency" value={`${eff}%`} hint="earned ÷ available minutes" icon="◔" color={eff >= s.planning.defaultEfficiency ? "#16a34a" : "#d97706"} />
        <StatCard label="Rejects" value={fmtNum(rejected)} hint={`${pct(rejected, produced + rejected)}% DHU-ish`} icon="✕" color="#dc2626" />
        <StatCard label="Earned hours" value={fmtNum(earned / 60)} hint={`of ${fmtNum(avail / 60)} available`} icon="◷" color="#2563eb" />
        <StatCard label="Entries" value={list.length} hint={`${dates.length} production days`} icon="≡" color="#7c3aed" />
      </div>

      <Card className="mt-5">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label>
            <span className="lbl">From</span>
            <input type="date" name="from" defaultValue={from} className="inp inp-sm" />
          </label>
          <label>
            <span className="lbl">To</span>
            <input type="date" name="to" defaultValue={to} className="inp inp-sm" />
          </label>
          <label>
            <span className="lbl">Line</span>
            <select name="line" defaultValue={sp.line ?? ""} className="inp inp-sm w-40">
              <option value="">All lines</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary btn-sm">Apply</button>
          <Link href="/production" className="btn btn-ghost btn-sm">
            Reset
          </Link>
        </form>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Daily output vs target">
          {trend.length === 0 ? (
            <EmptyState title="No data in range" />
          ) : (
            <div className="flex h-44 items-end gap-1">
              {trend.map((t) => (
                <div key={t.d} className="group relative flex flex-1 flex-col items-center justify-end gap-0.5" title={`${fmtDate(t.d)}: ${fmtNum(t.produced)} / ${fmtNum(t.target)}`}>
                  <div className="w-full rounded-t bg-slate-200" style={{ height: `${(t.target / maxTrend) * 100}%` }}>
                    <div className="w-full rounded-t bg-brand" style={{ height: `${t.target ? Math.min(100, (t.produced / t.target) * 100) : 100}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-400">{t.d.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Line performance in range" className="xl:col-span-2" noPad>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Days</th>
                  <th className="num">Target</th>
                  <th className="num">Produced</th>
                  <th className="num">Achieved</th>
                  <th className="num">Rejects</th>
                  <th className="num">Efficiency</th>
                  <th className="num">Line target eff.</th>
                </tr>
              </thead>
              <tbody>
                {lineSummary.map(({ l, p, tg, rj, eff, days }) => (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.name}</td>
                    <td className="num">{days}</td>
                    <td className="num">{fmtNum(tg)}</td>
                    <td className="num font-semibold">{fmtNum(p)}</td>
                    <td className="num">{pct(p, tg)}%</td>
                    <td className="num text-red-600">{fmtNum(rj)}</td>
                    <td className="num font-bold" style={{ color: eff >= l.efficiency ? "#16a34a" : "#d97706" }}>
                      {eff}%
                    </td>
                    <td className="num text-slate-500">{l.efficiency}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lineSummary.length === 0 && <EmptyState title="No production in range" />}
          </div>
        </Card>
      </div>

      <Card title="Production entries" className="mt-5" noPad>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Line</th>
                <th>Order</th>
                <th>Process</th>
                <th className="num">Target</th>
                <th className="num">Produced</th>
                <th className="num">Rejected</th>
                <th className="num">Manpower</th>
                <th className="num">Hours</th>
                <th className="num">SMV</th>
                <th className="num">Efficiency</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((r) => {
                const line = lk.lines.find((l) => l.id === r.lineId);
                const e = calcEfficiency(r.producedQty, Number(r.smv), r.manpower, r.workingHours);
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date, s.company.dateFormat)}</td>
                    <td className="font-medium">{line?.name}</td>
                    <td>
                      <Link href={`/orders/${r.orderId}?tab=production`} className="font-semibold text-brand hover:underline">
                        {r.orderNo}
                      </Link>
                      <div className="text-[11px] text-slate-500">{r.buyerName}</div>
                    </td>
                    <td>{r.process}</td>
                    <td className="num">{fmtNum(r.targetQty)}</td>
                    <td className="num font-semibold">{fmtNum(r.producedQty)}</td>
                    <td className="num text-red-600">{fmtNum(r.rejectedQty)}</td>
                    <td className="num">{r.manpower}</td>
                    <td className="num">{r.workingHours}</td>
                    <td className="num">{Number(r.smv).toFixed(2)}</td>
                    <td className="num font-bold" style={{ color: e >= (line?.efficiency ?? 60) ? "#16a34a" : "#d97706" }}>
                      {e}%
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="dailyProduction" title="Production entry" fields={fields} initial={r} variant="icon" size="lg" />
                      <DeleteButton entity="dailyProduction" id={r.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <EmptyState title="No entries" hint="Record today's line output using the button above." />}
        </div>
      </Card>
    </>
  );
}
