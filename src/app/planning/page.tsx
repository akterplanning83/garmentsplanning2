import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, gte, lte } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { allocatePlan } from "@/lib/actions";
import { getLookups, getOrders } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { addDays, dateRange, dayName, diffDays, fmtDate, isWorkingDay, monthLabel, startOfWeek, today, workingDaysBetween } from "@/lib/dates";
import { fmtNum, lineDailyCapacity, lineDailyMinutes, utilizationColor } from "@/lib/planning";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

const ALLOC_COLORS: Record<string, string> = { Planned: "#2563eb", Running: "#d97706", Completed: "#16a34a", "On Hold": "#64748b" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ start?: string; weeks?: string; factory?: string; section?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const T = today();
  const weekStart = s.planning.workingDays.includes(6) && !s.planning.workingDays.includes(5) ? 6 : s.planning.workingDays.includes(1) && !s.planning.workingDays.includes(0) ? 1 : 0;
  const start = sp.start ?? startOfWeek(addDays(T, -7), weekStart);
  const weeks = Math.min(12, Math.max(1, Number(sp.weeks ?? 4)));
  const days = dateRange(start, weeks * 7);
  const end = days[days.length - 1];
  const section = sp.section ?? "Sewing";

  const [lk, orders, allocs] = await Promise.all([
    getLookups(),
    getOrders(),
    db
      .select()
      .from(schema.planAllocations)
      .where(and(lte(schema.planAllocations.startDate, end), gte(schema.planAllocations.endDate, start))),
  ]);
  const holidaySet = new Set(lk.holidays.map((h) => h.date));
  const holidayNames = new Map(lk.holidays.map((h) => [h.date, h.name]));
  const lines = lk.lines.filter((l) => l.isActive && (section === "all" || l.section === section) && (!sp.factory || String(l.factoryId) === sp.factory));
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const activeOrders = orders.filter((o) => ["confirmed", "in_production"].includes(o.status));
  const unplanned = activeOrders.filter((o) => o.allocatedQty < o.quantity).sort((a, b) => a.shipDate.localeCompare(b.shipDate));

  const planFields = (initial?: { orderId?: number; qty?: number }): FieldDef[] => [
    {
      name: "orderId",
      label: "Order",
      type: "select",
      required: true,
      span: 2,
      options: activeOrders.map((o) => ({ value: String(o.id), label: `${o.orderNo} · ${o.buyerName} · ${o.styleName} · remaining ${fmtNum(Math.max(0, o.quantity - o.allocatedQty))} · ship ${fmtDate(o.shipDate, s.company.dateFormat)}` })),
      defaultValue: initial?.orderId ? String(initial.orderId) : undefined,
    },
    {
      name: "lineId",
      label: "Line",
      type: "select",
      required: true,
      span: 2,
      options: [{ value: "0", label: "⚡ Auto-select earliest free line" }, ...lk.lines.filter((l) => l.isActive).map((l) => ({ value: String(l.id), label: `${l.name} · ${l.factoryName ?? ""} · ${l.operators} op · ${l.efficiency}%` }))],
      defaultValue: "0",
    },
    { name: "process", label: "Process", type: "select", options: lk.processes.map((p) => ({ value: p.name, label: p.name })), defaultValue: s.planning.defaultProcess },
    { name: "startDate", label: "Start date", type: "date", required: true, defaultValue: T },
    { name: "plannedQty", label: "Planned qty", type: "number", required: true, defaultValue: initial?.qty },
    { name: "efficiency", label: "Efficiency % override", type: "number", step: "0.1" },
    { name: "dailyTarget", label: "Daily target override", type: "number", help: "Blank = auto from SMV & line capacity" },
    { name: "remarks", label: "Remarks" },
    { name: "__setInProduction", label: "Move order to In Production", type: "checkbox", defaultValue: true },
  ];

  const nav = (delta: number) => `/planning?start=${addDays(start, delta)}&weeks=${weeks}${sp.factory ? `&factory=${sp.factory}` : ""}&section=${section}`;
  const colTemplate = `repeat(${days.length}, minmax(30px, 1fr))`;

  // month header spans
  const months: { label: string; span: number }[] = [];
  for (const d of days) {
    const lbl = monthLabel(d);
    if (months.length && months[months.length - 1].label === lbl) months[months.length - 1].span++;
    else months.push({ label: lbl, span: 1 });
  }

  const totalWorkingDays = workingDaysBetween(start, end, s.planning.workingDays, holidaySet);

  return (
    <>
      <PageHeader
        title="Planning Board"
        subtitle={`${fmtDate(start, s.company.dateFormat)} – ${fmtDate(end, s.company.dateFormat)} · ${lines.length} lines · ${totalWorkingDays} working days`}
        actions={
          <>
            <Link href="/capacity" className="btn btn-ghost btn-sm">
              Capacity view
            </Link>
            <CrudModal entity="planAllocations" title="Allocate order to line" fields={planFields()} action={allocatePlan} variant="primary" trigger="+ Allocate" submitLabel="Allocate" size="lg" description="End date is computed automatically from SMV × line capacity across working days (holidays skipped)." />
          </>
        }
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <Link href={nav(-7 * weeks)} className="btn btn-secondary btn-sm">
            ← Prev
          </Link>
          <Link href={`/planning?weeks=${weeks}&section=${section}${sp.factory ? `&factory=${sp.factory}` : ""}`} className="btn btn-secondary btn-sm">
            Today
          </Link>
          <Link href={nav(7 * weeks)} className="btn btn-secondary btn-sm">
            Next →
          </Link>
          <input type="date" name="start" defaultValue={start} className="inp inp-sm w-40" />
          <select name="weeks" defaultValue={String(weeks)} className="inp inp-sm w-28">
            {[1, 2, 4, 6, 8, 12].map((w) => (
              <option key={w} value={w}>
                {w} week{w > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <select name="factory" defaultValue={sp.factory ?? ""} className="inp inp-sm w-40">
            <option value="">All factories</option>
            {lk.factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select name="section" defaultValue={section} className="inp inp-sm w-36">
            <option value="Sewing">Sewing lines</option>
            <option value="Cutting">Cutting</option>
            <option value="Finishing">Finishing</option>
            <option value="all">All sections</option>
          </select>
          <button className="btn btn-primary btn-sm">Apply</button>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
            {Object.entries(ALLOC_COLORS).map(([k, c]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {k}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" /> Off day
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border-l-2 border-red-500 bg-red-100" /> Ends after ship date
            </span>
          </div>
        </form>
      </Card>

      <Card noPad>
        <div className="overflow-x-auto scroll-thin">
          <div style={{ minWidth: 240 + days.length * 30 }}>
            {/* month header */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="w-60 shrink-0 border-r border-slate-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Line</div>
              <div className="grid flex-1" style={{ gridTemplateColumns: colTemplate }}>
                {months.map((m, i) => (
                  <div key={i} className="border-r border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600" style={{ gridColumn: `span ${m.span}` }}>
                    {m.label}
                  </div>
                ))}
              </div>
            </div>
            {/* day header */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="w-60 shrink-0 border-r border-slate-200 px-3 py-1 text-[10px] text-slate-400">Capacity · utilization in range</div>
              <div className="grid flex-1" style={{ gridTemplateColumns: colTemplate }}>
                {days.map((d) => {
                  const off = !isWorkingDay(d, s.planning.workingDays, holidaySet);
                  const isToday = d === T;
                  return (
                    <div key={d} className={`border-r border-slate-100 py-1 text-center text-[10px] leading-tight ${off ? "bg-slate-100 text-slate-400" : "text-slate-600"} ${isToday ? "bg-brand-soft font-bold text-brand" : ""}`} title={holidayNames.get(d) ?? d}>
                      <div>{dayName(d).slice(0, 2)}</div>
                      <div className="font-semibold">{d.slice(8, 10)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {lines.length === 0 && <EmptyState title="No lines to display" hint="Adjust the filters or add lines in Settings → Factories & Lines." />}

            {lines.map((line) => {
              const lineAllocs = allocs.filter((a) => a.lineId === line.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
              // lane packing
              const lanes: string[] = [];
              const placed = lineAllocs.map((a) => {
                let lane = lanes.findIndex((lastEnd) => lastEnd < a.startDate);
                if (lane === -1) {
                  lanes.push(a.endDate);
                  lane = lanes.length - 1;
                } else lanes[lane] = a.endDate;
                return { a, lane };
              });
              const laneCount = Math.max(1, lanes.length);
              // utilization in visible range
              const capMin = lineDailyMinutes(line, s) * totalWorkingDays;
              let loadMin = 0;
              for (const a of lineAllocs) {
                const o = orderMap.get(a.orderId);
                const smv = o?.smv ?? o?.styleSmv ?? 0;
                const from = a.startDate > start ? a.startDate : start;
                const to = a.endDate < end ? a.endDate : end;
                loadMin += workingDaysBetween(from, to, s.planning.workingDays, holidaySet) * a.dailyTarget * smv;
              }
              const util = capMin ? Math.round((loadMin / capMin) * 100) : 0;
              const refSmv = 10;
              return (
                <div key={line.id} className="flex border-b border-slate-100">
                  <div className="w-60 shrink-0 border-r border-slate-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded" style={{ background: line.colorHex ?? "#999" }} />
                      <span className="text-sm font-semibold text-slate-800">{line.name}</span>
                      <span className="text-[10px] text-slate-400">{line.factoryName}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {line.operators} op · {line.efficiency}% · {fmtNum(lineDailyCapacity(line, refSmv, s))} pcs/d @SMV {refSmv}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full" style={{ width: `${Math.min(100, util)}%`, background: utilizationColor(util, s) }} />
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: utilizationColor(util, s) }}>
                        {util}%
                      </span>
                    </div>
                  </div>
                  <div className="relative grid flex-1" style={{ gridTemplateColumns: colTemplate, gridAutoRows: "30px", paddingTop: 4, paddingBottom: 4 }}>
                    {days.map((d, i) => {
                      const off = !isWorkingDay(d, s.planning.workingDays, holidaySet);
                      return <div key={d} className={`border-r border-slate-100 ${off ? "bg-slate-100/70" : ""} ${d === T ? "border-l-2 border-l-brand" : ""}`} style={{ gridColumn: i + 1, gridRow: `1 / span ${laneCount}` }} />;
                    })}
                    {placed.map(({ a, lane }) => {
                      const o = orderMap.get(a.orderId);
                      const sIdx = Math.max(0, diffDays(start, a.startDate));
                      const eIdx = Math.min(days.length - 1, diffDays(start, a.endDate));
                      const span = Math.max(1, eIdx - sIdx + 1);
                      const late = o ? a.endDate > o.shipDate : false;
                      const color = ALLOC_COLORS[a.status] ?? "#2563eb";
                      return (
                        <Link
                          key={a.id}
                          href={`/orders/${a.orderId}?tab=plan`}
                          className="z-[1] m-[3px] flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] font-medium text-white shadow-sm hover:brightness-110"
                          style={{ gridColumn: `${sIdx + 1} / span ${span}`, gridRow: lane + 1, background: color, borderLeft: late ? "3px solid #dc2626" : undefined }}
                          title={`${o?.orderNo} · ${o?.buyerName} · ${o?.styleName}\n${fmtDate(a.startDate)} → ${fmtDate(a.endDate)} · ${fmtNum(a.plannedQty)} pcs @ ${fmtNum(a.dailyTarget)}/day\nShip: ${o ? fmtDate(o.shipDate) : "—"}${late ? " ⚠ ends after ship date" : ""}`}
                        >
                          <span className="truncate">
                            {o?.orderNo} · {o?.buyerName}
                          </span>
                          <span className="ml-auto shrink-0 opacity-90">{fmtNum(a.plannedQty)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title={`Unplanned / partially planned orders (${unplanned.length})`} className="xl:col-span-2" noPad>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer / Style</th>
                  <th>Ship date</th>
                  <th className="num">SMV</th>
                  <th className="num">Order qty</th>
                  <th className="num">Planned</th>
                  <th className="num">Remaining</th>
                  <th>Priority</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {unplanned.map((o) => {
                  const rem = o.quantity - o.allocatedQty;
                  const d = diffDays(T, o.shipDate);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/orders/${o.id}?tab=plan`} className="font-semibold text-brand hover:underline">
                          {o.orderNo}
                        </Link>
                      </td>
                      <td>
                        <div className="font-medium">{o.buyerName}</div>
                        <div className="text-[11px] text-slate-500">{o.styleName}</div>
                      </td>
                      <td>
                        <div>{fmtDate(o.shipDate, s.company.dateFormat)}</div>
                        <div className={`text-[11px] ${d < 21 ? "font-semibold text-red-600" : "text-slate-400"}`}>{d}d</div>
                      </td>
                      <td className="num">{(o.smv ?? o.styleSmv ?? 0).toFixed(2)}</td>
                      <td className="num">{fmtNum(o.quantity)}</td>
                      <td className="num">{fmtNum(o.allocatedQty)}</td>
                      <td className="num font-semibold text-amber-700">{fmtNum(rem)}</td>
                      <td>
                        <Badge label={statusMeta(s.priorities, o.priority).label} color={statusMeta(s.priorities, o.priority).color} />
                      </td>
                      <td className="text-right">
                        <CrudModal entity="planAllocations" title="Allocate order to line" fields={planFields({ orderId: o.id, qty: rem })} action={allocatePlan} variant="secondary" trigger="Plan" submitLabel="Allocate" size="lg" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {unplanned.length === 0 && <EmptyState title="All active orders are fully planned" />}
          </div>
        </Card>
        <Card title="Planning rules in effect">
          <ul className="space-y-1.5 text-xs text-slate-600">
            <li>• Working days: {s.planning.workingDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}</li>
            <li>• Standard hours/day: {s.planning.workingHoursPerDay}h (+{s.planning.overtimeHours}h OT allowed)</li>
            <li>• Capacity/day = operators × hours × 60 × efficiency ÷ SMV</li>
            <li>• Holidays skipped: {lk.holidays.length} configured</li>
            <li>
              • Utilization warning at {s.planning.utilizationWarn}%, critical at {s.planning.utilizationCritical}%
            </li>
            <li>• Auto-select picks the line that frees up earliest (tie → higher capacity)</li>
          </ul>
          <Link href="/settings" className="mt-3 inline-block text-xs font-semibold text-brand">
            Change planning rules →
          </Link>
        </Card>
      </div>
    </>
  );
}
