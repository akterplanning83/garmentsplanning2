import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { getOrders, getLines } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { addDays, fmtDate, today, startOfWeek, workingDaysBetween, diffDays } from "@/lib/dates";
import { calcEfficiency, fmtMoney, fmtNum, lineDailyMinutes, pct, utilizationColor } from "@/lib/planning";
import { Badge, Card, EmptyState, PageHeader, Progress, StatCard } from "@/components/ui";
import { ActionButton } from "@/components/client-bits";
import { loadDemoData } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const s = await getSettings();
  const T = today();
  const [orders, lines, holidays] = await Promise.all([getOrders(), getLines(), db.select().from(schema.holidays)]);

  if (orders.length === 0) {
    const buyerCount = await db.select({ c: sql<number>`count(*)` }).from(schema.buyers);
    if (Number(buyerCount[0]?.c ?? 0) === 0) {
      return (
        <div className="mx-auto max-w-2xl pt-16">
          <Card>
            <EmptyState
              title="Welcome to your Garments Planning ERP"
              hint="The database is empty. Load the demo dataset (buyers, styles, orders, lines, TNA, production) to explore every module, or start configuring from Settings."
              action={
                <div className="flex gap-2">
                  <ActionButton action={loadDemoData} className="btn btn-primary" successMessage="Demo data loaded">
                    Load demo data
                  </ActionButton>
                  <Link href="/settings" className="btn btn-secondary">
                    Go to Settings
                  </Link>
                </div>
              }
            />
          </Card>
        </div>
      );
    }
  }

  const holidaySet = new Set(holidays.map((h) => h.date));
  const activeStatuses = new Set(["confirmed", "in_production"]);
  const active = orders.filter((o) => activeStatuses.has(o.status));
  const activeQty = active.reduce((a, o) => a + o.quantity, 0);
  const activeValue = active.reduce((a, o) => a + o.quantity * o.unitPrice, 0);
  const dueSoon = active.filter((o) => o.shipDate >= T && o.shipDate <= addDays(T, 14));
  const overdue = active.filter((o) => o.shipDate < T);
  const unplanned = active.filter((o) => o.allocatedQty < o.quantity);

  const delayedTasks = await db
    .select({
      id: schema.tnaTasks.id,
      name: schema.tnaTasks.name,
      department: schema.tnaTasks.department,
      plannedEnd: schema.tnaTasks.plannedEnd,
      status: schema.tnaTasks.status,
      orderId: schema.tnaTasks.orderId,
      orderNo: schema.orders.orderNo,
      orderStatus: schema.orders.status,
    })
    .from(schema.tnaTasks)
    .innerJoin(schema.orders, eq(schema.tnaTasks.orderId, schema.orders.id))
    .where(and(ne(schema.tnaTasks.status, "Completed"), sql`${schema.tnaTasks.plannedEnd} < ${T}`, ne(schema.orders.status, "cancelled"), ne(schema.orders.status, "shipped")))
    .orderBy(asc(schema.tnaTasks.plannedEnd));

  const weekAgo = addDays(T, -7);
  const recentProd = await db
    .select({
      date: schema.dailyProduction.date,
      lineId: schema.dailyProduction.lineId,
      produced: schema.dailyProduction.producedQty,
      rejected: schema.dailyProduction.rejectedQty,
      manpower: schema.dailyProduction.manpower,
      hours: schema.dailyProduction.workingHours,
      smv: sql<number>`coalesce(${schema.orders.smv}, ${schema.styles.smv}, 0)`,
    })
    .from(schema.dailyProduction)
    .innerJoin(schema.orders, eq(schema.dailyProduction.orderId, schema.orders.id))
    .leftJoin(schema.styles, eq(schema.orders.styleId, schema.styles.id))
    .where(gte(schema.dailyProduction.date, weekAgo));

  const weekOutput = recentProd.reduce((a, r) => a + r.produced, 0);
  const weekMinutes = recentProd.reduce((a, r) => a + r.produced * Number(r.smv), 0);
  const weekAvail = recentProd.reduce((a, r) => a + r.manpower * r.hours * 60, 0);
  const weekEff = weekAvail ? Math.round((weekMinutes / weekAvail) * 1000) / 10 : 0;
  const lastDay = recentProd.reduce((m, r) => (r.date > m ? r.date : m), "");
  const lastDayOutput = recentProd.filter((r) => r.date === lastDay).reduce((a, r) => a + r.produced, 0);

  // Line utilization this week
  const wkStart = startOfWeek(T, s.planning.workingDays.includes(6) && !s.planning.workingDays.includes(5) ? 6 : 1);
  const wkEnd = addDays(wkStart, 6);
  const allocs = await db.select().from(schema.planAllocations);
  const sewing = lines.filter((l) => l.isActive && l.section === "Sewing");
  const wkDays = workingDaysBetween(wkStart, wkEnd, s.planning.workingDays, holidaySet);
  const lineLoad = sewing.map((l) => {
    const capMin = lineDailyMinutes(l, s) * wkDays;
    let loadMin = 0;
    for (const a of allocs.filter((a) => a.lineId === l.id && a.startDate <= wkEnd && a.endDate >= wkStart)) {
      const o = orders.find((x) => x.id === a.orderId);
      const smv = o?.smv ?? o?.styleSmv ?? 0;
      const from = a.startDate > wkStart ? a.startDate : wkStart;
      const to = a.endDate < wkEnd ? a.endDate : wkEnd;
      const d = workingDaysBetween(from, to, s.planning.workingDays, holidaySet);
      loadMin += d * a.dailyTarget * smv;
    }
    return { line: l, util: capMin ? Math.round((loadMin / capMin) * 100) : 0 };
  });
  const avgUtil = lineLoad.length ? Math.round(lineLoad.reduce((a, x) => a + x.util, 0) / lineLoad.length) : 0;

  const pendingBom = await db
    .select({ id: schema.bomItems.id, itemName: schema.bomItems.itemName, status: schema.bomItems.status, etaDate: schema.bomItems.etaDate, orderNo: schema.orders.orderNo, orderId: schema.orders.id, shipDate: schema.orders.shipDate })
    .from(schema.bomItems)
    .innerJoin(schema.orders, eq(schema.bomItems.orderId, schema.orders.id))
    .where(and(ne(schema.bomItems.status, "In-house"), sql`${schema.orders.status} in ('confirmed','in_production')`))
    .orderBy(asc(schema.bomItems.etaDate));
  const materialAlerts = pendingBom.filter((b) => !b.etaDate || b.etaDate <= addDays(T, 7));

  const statusCounts = s.orderStatuses.map((st) => ({ ...st, count: orders.filter((o) => o.status === st.key).length }));
  const maxCount = Math.max(1, ...statusCounts.map((x) => x.count));

  return (
    <>
      <PageHeader
        title="Planning Dashboard"
        subtitle={`Live overview · week of ${fmtDate(wkStart, s.company.dateFormat)}`}
        actions={
          <>
            <Link href="/orders/new" className="btn btn-primary btn-sm">
              + New Order
            </Link>
            <Link href="/planning" className="btn btn-secondary btn-sm">
              Open Planning Board
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Active Orders" value={active.length} hint={`${orders.length} total`} icon="▤" color="#2563eb" />
        <StatCard label="Active Qty" value={fmtNum(activeQty)} hint="pcs in pipeline" icon="◫" color="#0f766e" />
        <StatCard label="Order Value" value={fmtMoney(activeValue, s.company.currency)} hint="active orders" icon="$" color="#16a34a" />
        <StatCard label="Ship ≤ 14 days" value={dueSoon.length} hint={overdue.length ? `${overdue.length} overdue!` : "none overdue"} icon="➤" color={overdue.length ? "#dc2626" : "#d97706"} />
        <StatCard label="Unplanned" value={unplanned.length} hint="orders need line plan" icon="▦" color="#7c3aed" />
        <StatCard label="Delayed TNA" value={delayedTasks.length} hint="tasks past due" icon="◷" color="#dc2626" />
        <StatCard label="Line Utilization" value={`${avgUtil}%`} hint="this week avg" icon="◔" color={utilizationColor(avgUtil, s)} />
        <StatCard label="7-day Efficiency" value={`${weekEff}%`} hint={`${fmtNum(weekOutput)} pcs · last day ${fmtNum(lastDayOutput)}`} icon="▲" color="#0891b2" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Upcoming shipments (30 days)" className="xl:col-span-2" noPad actions={<Link href="/orders" className="text-xs font-semibold text-brand">All orders →</Link>}>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer / Style</th>
                  <th>Ship date</th>
                  <th className="num">Qty</th>
                  <th>Planned</th>
                  <th>Produced</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter((o) => activeStatuses.has(o.status) && o.shipDate <= addDays(T, 30))
                  .slice(0, 10)
                  .map((o) => {
                    const days = diffDays(T, o.shipDate);
                    return (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/orders/${o.id}`} className="font-semibold text-brand hover:underline">
                            {o.orderNo}
                          </Link>
                          <div className="text-[11px] text-slate-400">{o.poNumber}</div>
                        </td>
                        <td>
                          <div className="font-medium">{o.buyerName}</div>
                          <div className="text-[11px] text-slate-500">
                            {o.styleNo} · {o.styleName}
                          </div>
                        </td>
                        <td>
                          <div>{fmtDate(o.shipDate, s.company.dateFormat)}</div>
                          <div className={`text-[11px] ${days < 0 ? "text-red-600 font-semibold" : days <= 7 ? "text-amber-600" : "text-slate-400"}`}>{days < 0 ? `${-days}d overdue` : `${days}d left`}</div>
                        </td>
                        <td className="num">{fmtNum(o.quantity)}</td>
                        <td className="w-28">
                          <Progress value={pct(o.allocatedQty, o.quantity)} color="#7c3aed" />
                          <div className="text-[11px] text-slate-500">{pct(o.allocatedQty, o.quantity)}%</div>
                        </td>
                        <td className="w-28">
                          <Progress value={pct(o.producedQty, o.quantity)} color="#0f766e" />
                          <div className="text-[11px] text-slate-500">{pct(o.producedQty, o.quantity)}%</div>
                        </td>
                        <td>
                          <Badge label={statusMeta(s.orderStatuses, o.status).label} color={statusMeta(s.orderStatuses, o.status).color} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {active.length === 0 && <EmptyState title="No active orders" hint="Create an order to get started." />}
          </div>
        </Card>

        <Card title="Order pipeline">
          <div className="space-y-2.5">
            {statusCounts.map((st) => (
              <div key={st.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{st.label}</span>
                  <span className="text-slate-500">{st.count}</span>
                </div>
                <Progress value={(st.count / maxCount) * 100} color={st.color} height={8} />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Statuses are configurable in <Link href="/settings/fields" className="font-semibold text-brand">Settings → Statuses</Link>.
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Line utilization · this week" actions={<Link href="/capacity" className="text-xs font-semibold text-brand">Capacity →</Link>}>
          {lineLoad.length === 0 ? (
            <EmptyState title="No sewing lines" hint="Add lines in Settings → Factories & Lines." />
          ) : (
            <div className="space-y-2">
              {lineLoad.map(({ line, util }) => (
                <div key={line.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 truncate font-medium text-slate-700" title={line.factoryName ?? ""}>
                    {line.name}
                  </span>
                  <div className="flex-1">
                    <Progress value={Math.min(util, 100)} color={utilizationColor(util, s)} height={8} />
                  </div>
                  <span className="w-10 text-right font-semibold" style={{ color: utilizationColor(util, s) }}>
                    {util}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Delayed TNA tasks" actions={<Link href="/tna?filter=delayed" className="text-xs font-semibold text-brand">All →</Link>} noPad>
          {delayedTasks.length === 0 ? (
            <EmptyState title="No delayed tasks" hint="All critical path activities are on schedule." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {delayedTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{t.name}</div>
                    <div className="text-slate-500">
                      <Link href={`/orders/${t.orderId}?tab=tna`} className="text-brand">
                        {t.orderNo}
                      </Link>{" "}
                      · {t.department}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">{diffDays(t.plannedEnd, T)}d late</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Material alerts" actions={<Link href="/materials" className="text-xs font-semibold text-brand">Materials →</Link>} noPad>
          {materialAlerts.length === 0 ? (
            <EmptyState title="No material risks" hint="All pending items have comfortable ETAs." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {materialAlerts.slice(0, 8).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{b.itemName}</div>
                    <div className="text-slate-500">
                      <Link href={`/orders/${b.orderId}?tab=bom`} className="text-brand">
                        {b.orderNo}
                      </Link>{" "}
                      · ETA {fmtDate(b.etaDate, s.company.dateFormat)}
                    </div>
                  </div>
                  <Badge label={b.status} color={b.status === "Pending" ? "#dc2626" : "#d97706"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Recent line efficiency (7 days)" noPad actions={<Link href="/production" className="text-xs font-semibold text-brand">Production →</Link>}>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Output</th>
                  <th className="num">Rejects</th>
                  <th className="num">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {sewing
                  .map((l) => {
                    const rows = recentProd.filter((r) => r.lineId === l.id);
                    const produced = rows.reduce((a, r) => a + r.produced, 0);
                    const rejected = rows.reduce((a, r) => a + r.rejected, 0);
                    const mins = rows.reduce((a, r) => a + r.produced * Number(r.smv), 0);
                    const avail = rows.reduce((a, r) => a + r.manpower * r.hours * 60, 0);
                    const eff = avail ? Math.round((mins / avail) * 1000) / 10 : 0;
                    return { l, produced, rejected, eff };
                  })
                  .filter((x) => x.produced > 0)
                  .map(({ l, produced, rejected, eff }) => (
                    <tr key={l.id}>
                      <td className="font-medium">{l.name}</td>
                      <td className="num">{fmtNum(produced)}</td>
                      <td className="num text-red-600">{fmtNum(rejected)}</td>
                      <td className="num font-semibold" style={{ color: eff >= l.efficiency ? "#16a34a" : "#d97706" }}>
                        {eff}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {recentProd.length === 0 && <EmptyState title="No production recorded" hint="Enter daily output in the Production module." />}
          </div>
        </Card>
        <Card title="Orders needing a line plan" noPad actions={<Link href="/planning" className="text-xs font-semibold text-brand">Plan →</Link>}>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Style</th>
                  <th>Ship</th>
                  <th className="num">Remaining</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {unplanned.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}?tab=plan`} className="font-semibold text-brand hover:underline">
                        {o.orderNo}
                      </Link>
                    </td>
                    <td className="text-slate-600">{o.styleName}</td>
                    <td>{fmtDate(o.shipDate, s.company.dateFormat)}</td>
                    <td className="num">{fmtNum(o.quantity - o.allocatedQty)}</td>
                    <td>
                      <Badge label={statusMeta(s.priorities, o.priority).label} color={statusMeta(s.priorities, o.priority).color} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unplanned.length === 0 && <EmptyState title="Everything is planned" hint="All active orders are fully allocated to lines." />}
          </div>
        </Card>
      </div>
      <p className="mt-6 text-[11px] text-slate-400">Efficiency = produced pcs × SMV ÷ (manpower × hours × 60). Capacity math uses {s.planning.workingHoursPerDay}h/day and configured working days — {calcEfficiency(1, 1, 1, 1) >= 0 ? "adjust in Settings → Planning." : ""}</p>
    </>
  );
}
