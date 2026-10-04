import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { getLookups, getOrders } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, shortDate, startOfWeek, today, workingDaysBetween } from "@/lib/dates";
import { fmtNum, lineDailyCapacity, lineDailyMinutes, utilizationColor } from "@/lib/planning";

export const dynamic = "force-dynamic";

export default async function CapacityPage({ searchParams }: { searchParams: Promise<{ weeks?: string; smv?: string; factory?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const T = today();
  const weeks = Math.min(16, Math.max(2, Number(sp.weeks ?? s.planning.planningHorizonWeeks)));
  const refSmv = Number(sp.smv ?? 10) || 10;
  const weekStart = s.planning.workingDays.includes(6) && !s.planning.workingDays.includes(5) ? 6 : 1;
  const start = startOfWeek(T, weekStart);

  const [lk, orders, allocs] = await Promise.all([getLookups(), getOrders(), db.select().from(schema.planAllocations)]);
  const holidaySet = new Set(lk.holidays.map((h) => h.date));
  const lines = lk.lines.filter((l) => l.isActive && l.section === "Sewing" && (!sp.factory || String(l.factoryId) === sp.factory));
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const weekCols = Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, i * 7);
    const we = addDays(ws, 6);
    return { ws, we, wd: workingDaysBetween(ws, we, s.planning.workingDays, holidaySet) };
  });

  const matrix = lines.map((line) => {
    const cells = weekCols.map((w) => {
      const capMin = lineDailyMinutes(line, s) * w.wd;
      let loadMin = 0;
      let pcs = 0;
      for (const a of allocs.filter((a) => a.lineId === line.id && a.startDate <= w.we && a.endDate >= w.ws)) {
        const o = orderMap.get(a.orderId);
        const smv = o?.smv ?? o?.styleSmv ?? 0;
        const from = a.startDate > w.ws ? a.startDate : w.ws;
        const to = a.endDate < w.we ? a.endDate : w.we;
        const d = workingDaysBetween(from, to, s.planning.workingDays, holidaySet);
        loadMin += d * a.dailyTarget * smv;
        pcs += d * a.dailyTarget;
      }
      return { util: capMin ? Math.round((loadMin / capMin) * 100) : 0, loadMin, capMin, pcs };
    });
    const totalCap = cells.reduce((a, c) => a + c.capMin, 0);
    const totalLoad = cells.reduce((a, c) => a + c.loadMin, 0);
    return { line, cells, util: totalCap ? Math.round((totalLoad / totalCap) * 100) : 0, totalCap, totalLoad };
  });

  const horizonCapMin = matrix.reduce((a, r) => a + r.totalCap, 0);
  const horizonLoadMin = matrix.reduce((a, r) => a + r.totalLoad, 0);
  const horizonUtil = horizonCapMin ? Math.round((horizonLoadMin / horizonCapMin) * 100) : 0;
  const dailyCapMin = lines.reduce((a, l) => a + lineDailyMinutes(l, s), 0);
  const demandMin = orders.filter((o) => ["confirmed", "in_production"].includes(o.status)).reduce((a, o) => a + Math.max(0, o.quantity - o.producedQty) * (o.smv ?? o.styleSmv ?? 0), 0);
  const overloadedWeeks = weekCols.filter((_, i) => {
    const cap = matrix.reduce((a, r) => a + r.cells[i].capMin, 0);
    const load = matrix.reduce((a, r) => a + r.cells[i].loadMin, 0);
    return cap && load / cap >= s.planning.utilizationCritical / 100;
  }).length;

  return (
    <>
      <PageHeader
        title="Capacity Planning"
        subtitle={`${weeks}-week horizon from ${fmtDate(start, s.company.dateFormat)} · ${lines.length} sewing lines`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <select name="factory" defaultValue={sp.factory ?? ""} className="inp inp-sm w-36">
              <option value="">All factories</option>
              {lk.factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select name="weeks" defaultValue={String(weeks)} className="inp inp-sm w-28">
              {[4, 6, 8, 10, 12, 16].map((w) => (
                <option key={w} value={w}>
                  {w} weeks
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              Ref. SMV
              <input name="smv" type="number" step="0.1" defaultValue={refSmv} className="inp inp-sm w-20" />
            </label>
            <button className="btn btn-primary btn-sm">Apply</button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Daily capacity" value={`${fmtNum(dailyCapMin / 60)} h`} hint={`${fmtNum(dailyCapMin)} std. minutes / day`} icon="◔" color="#0f766e" />
        <StatCard label={`Pcs/day @ SMV ${refSmv}`} value={fmtNum(lines.reduce((a, l) => a + lineDailyCapacity(l, refSmv, s), 0))} hint="all selected lines" icon="▲" color="#2563eb" />
        <StatCard label="Horizon utilization" value={`${horizonUtil}%`} hint={`${fmtNum(horizonLoadMin / 60)} h planned of ${fmtNum(horizonCapMin / 60)} h`} icon="◫" color={utilizationColor(horizonUtil, s)} />
        <StatCard label="Open demand" value={`${fmtNum(demandMin / 60)} h`} hint={`≈ ${dailyCapMin ? fmtNum(demandMin / dailyCapMin, 1) : "—"} full working days`} icon="▤" color="#7c3aed" />
        <StatCard label="Overloaded weeks" value={overloadedWeeks} hint={`≥ ${s.planning.utilizationCritical}% load`} icon="!" color={overloadedWeeks ? "#dc2626" : "#16a34a"} />
      </div>

      <Card title="Weekly load vs. capacity (utilization %)" className="mt-5" noPad>
        <div className="overflow-x-auto scroll-thin">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Line</th>
                <th className="num">Op.</th>
                <th className="num">Eff%</th>
                <th className="num">Min/day</th>
                {weekCols.map((w) => (
                  <th key={w.ws} className="text-center">
                    <div>{shortDate(w.ws)}</div>
                    <div className="font-normal text-slate-400">{w.wd} wd</div>
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ line, cells, util }) => (
                <tr key={line.id}>
                  <td>
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="h-3 w-3 rounded" style={{ background: line.colorHex ?? "#999" }} />
                      {line.name}
                    </span>
                    <div className="text-[11px] text-slate-400">{line.factoryName}</div>
                  </td>
                  <td className="num">{line.operators}</td>
                  <td className="num">{line.efficiency}</td>
                  <td className="num">{fmtNum(lineDailyMinutes(line, s))}</td>
                  {cells.map((c, i) => (
                    <td key={i} className="p-1 text-center">
                      <div className="rounded-md px-1 py-1.5 text-xs font-bold text-white" style={{ background: c.util ? utilizationColor(c.util, s) : "#e2e8f0", color: c.util ? "white" : "#94a3b8" }} title={`${fmtNum(c.pcs)} pcs · ${fmtNum(c.loadMin / 60)} h of ${fmtNum(c.capMin / 60)} h`}>
                        {c.util}%
                      </div>
                    </td>
                  ))}
                  <td className="num font-bold" style={{ color: utilizationColor(util, s) }}>
                    {util}%
                  </td>
                </tr>
              ))}
              {matrix.length > 0 && (
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={4}>Factory total</td>
                  {weekCols.map((_, i) => {
                    const cap = matrix.reduce((a, r) => a + r.cells[i].capMin, 0);
                    const load = matrix.reduce((a, r) => a + r.cells[i].loadMin, 0);
                    const u = cap ? Math.round((load / cap) * 100) : 0;
                    return (
                      <td key={i} className="text-center" style={{ color: utilizationColor(u, s) }}>
                        {u}%
                      </td>
                    );
                  })}
                  <td className="num" style={{ color: utilizationColor(horizonUtil, s) }}>
                    {horizonUtil}%
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {matrix.length === 0 && <EmptyState title="No sewing lines" hint="Add lines in Settings → Factories & Lines." />}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" /> under {s.planning.utilizationWarn}%
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-600" /> {s.planning.utilizationWarn}–{s.planning.utilizationCritical}%
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-600" /> ≥ {s.planning.utilizationCritical}% overloaded
          </span>
          <Link href="/planning" className="ml-auto font-semibold text-brand">
            Adjust on planning board →
          </Link>
        </div>
      </Card>

      <Card title={`Line capacity reference @ SMV ${refSmv} (change reference SMV above)`} className="mt-5" noPad>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Factory</th>
                <th className="num">Operators</th>
                <th className="num">Helpers</th>
                <th className="num">Machines</th>
                <th className="num">Hours</th>
                <th className="num">Eff %</th>
                <th className="num">Std min / day</th>
                <th className="num">Pcs / day</th>
                <th className="num">Pcs / hour</th>
                <th className="num">Pcs / week</th>
                <th className="num">With OT (+{s.planning.overtimeHours}h)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const hours = l.workingHours ?? s.planning.workingHoursPerDay;
                const perDay = lineDailyCapacity(l, refSmv, s);
                const wd = s.planning.workingDays.length;
                const ot = Math.floor((l.operators * (hours + s.planning.overtimeHours) * 60 * (l.efficiency / 100)) / refSmv);
                return (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.name}</td>
                    <td className="text-slate-600">{l.factoryName}</td>
                    <td className="num">{l.operators}</td>
                    <td className="num">{l.helpers}</td>
                    <td className="num">{l.machines}</td>
                    <td className="num">{hours}</td>
                    <td className="num">{l.efficiency}%</td>
                    <td className="num">{fmtNum(lineDailyMinutes(l, s))}</td>
                    <td className="num font-bold">{fmtNum(perDay)}</td>
                    <td className="num">{fmtNum(perDay / hours)}</td>
                    <td className="num">{fmtNum(perDay * wd)}</td>
                    <td className="num text-slate-600">{fmtNum(ot)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
