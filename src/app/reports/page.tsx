import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, gte, sql } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader, Progress, Tabs } from "@/components/ui";
import { getLines, getOrders } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { addDays, fmtDate, monthLabel, today } from "@/lib/dates";
import { fmtMoney, fmtNum, pct } from "@/lib/planning";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "status" } = await searchParams;
  const s = await getSettings();
  const T = today();
  const [orders, lines] = await Promise.all([getOrders(), getLines()]);
  const cur = s.company.currency;

  const tabs = [
    { key: "status", label: "Order status" },
    { key: "buyer", label: "Buyer-wise" },
    { key: "shipment", label: "Shipment schedule" },
    { key: "efficiency", label: "Line efficiency" },
    { key: "tna", label: "TNA performance" },
    { key: "otif", label: "On-time delivery" },
  ].map((t) => ({ ...t, href: `/reports?tab=${t.key}` }));

  const exportMap: Record<string, string> = { status: "orders", buyer: "orders", shipment: "orders", efficiency: "production", tna: "tna", otif: "plan" };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Management summaries · export any report as CSV"
        actions={
          <a href={`/api/export?report=${exportMap[tab] ?? "orders"}`} className="btn btn-secondary btn-sm">
            ⇩ Export {exportMap[tab] ?? "orders"} CSV
          </a>
        }
      />
      <Tabs tabs={tabs} active={tab} className="mb-4" />

      {tab === "status" && (
        <Card title="Order status summary" noPad>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Status</th>
                <th className="num">Orders</th>
                <th className="num">Quantity</th>
                <th className="num">Value ({cur})</th>
                <th className="num">Planned %</th>
                <th className="num">Produced %</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {s.orderStatuses.map((st) => {
                const rows = orders.filter((o) => o.status === st.key);
                const qty = rows.reduce((a, o) => a + o.quantity, 0);
                const val = rows.reduce((a, o) => a + o.quantity * o.unitPrice, 0);
                const alloc = rows.reduce((a, o) => a + Math.min(o.allocatedQty, o.quantity), 0);
                const prodQ = rows.reduce((a, o) => a + Math.min(o.producedQty, o.quantity), 0);
                return (
                  <tr key={st.key}>
                    <td>
                      <Badge label={st.label} color={st.color} />
                    </td>
                    <td className="num">{rows.length}</td>
                    <td className="num">{fmtNum(qty)}</td>
                    <td className="num">{fmtNum(val, 2)}</td>
                    <td className="num">{pct(alloc, qty)}%</td>
                    <td className="num">{pct(prodQ, qty)}%</td>
                    <td className="w-48">
                      <Progress value={pct(rows.length, orders.length)} color={st.color} />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td>Total</td>
                <td className="num">{orders.length}</td>
                <td className="num">{fmtNum(orders.reduce((a, o) => a + o.quantity, 0))}</td>
                <td className="num">{fmtNum(orders.reduce((a, o) => a + o.quantity * o.unitPrice, 0), 2)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === "buyer" && (
        <Card title="Buyer-wise business summary" noPad>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th className="num">Orders</th>
                <th className="num">Active</th>
                <th className="num">Quantity</th>
                <th className="num">Value ({cur})</th>
                <th className="num">Avg FOB</th>
                <th className="num">Avg SMV</th>
                <th className="num">Shipped qty</th>
                <th>Value share</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(orders.map((o) => o.buyerName ?? "—")))
                .map((b) => {
                  const rows = orders.filter((o) => (o.buyerName ?? "—") === b && o.status !== "cancelled");
                  const qty = rows.reduce((a, o) => a + o.quantity, 0);
                  const val = rows.reduce((a, o) => a + o.quantity * o.unitPrice, 0);
                  const smv = rows.length ? rows.reduce((a, o) => a + (o.smv ?? o.styleSmv ?? 0), 0) / rows.length : 0;
                  return { b, rows, qty, val, smv, shipped: rows.reduce((a, o) => a + o.shippedQty, 0), active: rows.filter((o) => ["confirmed", "in_production"].includes(o.status)).length };
                })
                .sort((a, b) => b.val - a.val)
                .map((x, _, arr) => (
                  <tr key={x.b}>
                    <td className="font-semibold">{x.b}</td>
                    <td className="num">{x.rows.length}</td>
                    <td className="num">{x.active}</td>
                    <td className="num">{fmtNum(x.qty)}</td>
                    <td className="num">{fmtNum(x.val, 2)}</td>
                    <td className="num">{x.qty ? (x.val / x.qty).toFixed(2) : "—"}</td>
                    <td className="num">{x.smv.toFixed(2)}</td>
                    <td className="num">{fmtNum(x.shipped)}</td>
                    <td className="w-48">
                      <Progress value={pct(x.val, arr.reduce((a, y) => a + y.val, 0))} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "shipment" && (
        <Card title="Monthly shipment schedule (active orders)" noPad>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Orders</th>
                <th className="num">Quantity</th>
                <th className="num">Value ({cur})</th>
                <th className="num">Std. hours needed</th>
                <th className="num">Produced %</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(orders.filter((o) => ["confirmed", "in_production", "completed"].includes(o.status)).map((o) => o.shipDate.slice(0, 7))))
                .sort()
                .map((m) => {
                  const rows = orders.filter((o) => o.shipDate.startsWith(m) && ["confirmed", "in_production", "completed"].includes(o.status));
                  const qty = rows.reduce((a, o) => a + o.quantity, 0);
                  return (
                    <tr key={m}>
                      <td className="font-semibold">{monthLabel(`${m}-01`)}</td>
                      <td className="num">{rows.length}</td>
                      <td className="num">{fmtNum(qty)}</td>
                      <td className="num">{fmtNum(rows.reduce((a, o) => a + o.quantity * o.unitPrice, 0), 2)}</td>
                      <td className="num">{fmtNum(rows.reduce((a, o) => a + (o.quantity * (o.smv ?? o.styleSmv ?? 0)) / 60, 0))}</td>
                      <td className="num">{pct(rows.reduce((a, o) => a + Math.min(o.producedQty, o.quantity), 0), qty)}%</td>
                      <td className="text-xs">
                        {rows.map((o) => (
                          <Link key={o.id} href={`/orders/${o.id}`} className="mr-2 text-brand">
                            {o.orderNo}
                          </Link>
                        ))}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "efficiency" && <EfficiencyReport lines={lines} />}

      {tab === "tna" && <TnaReport />}

      {tab === "otif" && (
        <Card title="On-time delivery & lead time" noPad>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Planned ship</th>
                <th className="num">Lead time (d)</th>
                <th className="num">Qty</th>
                <th className="num">Shipped</th>
                <th>Status</th>
                <th>Delivery</th>
              </tr>
            </thead>
            <tbody>
              {orders
                .filter((o) => o.status !== "cancelled" && o.status !== "inquiry")
                .map((o) => {
                  const full = o.shippedQty >= o.quantity;
                  const late = !full && o.shipDate < T;
                  const lead = Math.round((new Date(o.shipDate).getTime() - new Date(o.orderDate).getTime()) / 86400000);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/orders/${o.id}`} className="font-semibold text-brand">
                          {o.orderNo}
                        </Link>
                      </td>
                      <td>{o.buyerName}</td>
                      <td>{fmtDate(o.shipDate, s.company.dateFormat)}</td>
                      <td className="num">{lead}</td>
                      <td className="num">{fmtNum(o.quantity)}</td>
                      <td className="num">{fmtNum(o.shippedQty)}</td>
                      <td>
                        <Badge label={statusMeta(s.orderStatuses, o.status).label} color={statusMeta(s.orderStatuses, o.status).color} />
                      </td>
                      <td>{full ? <Badge label="Delivered" color="#16a34a" /> : late ? <Badge label="Late" color="#dc2626" /> : <Badge label="Scheduled" color="#2563eb" />}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-4 text-[11px] text-slate-400">Values in {fmtMoney(0, cur).split(" ")[0]} · generated {fmtDate(T, s.company.dateFormat)}</p>
    </>
  );
}

async function EfficiencyReport({ lines }: { lines: Awaited<ReturnType<typeof getLines>> }) {
  const from = addDays(today(), -30);
  const rows = await db
    .select({
      lineId: schema.dailyProduction.lineId,
      produced: sql<number>`sum(${schema.dailyProduction.producedQty})`,
      rejected: sql<number>`sum(${schema.dailyProduction.rejectedQty})`,
      target: sql<number>`sum(${schema.dailyProduction.targetQty})`,
      earned: sql<number>`sum(${schema.dailyProduction.producedQty} * coalesce(${schema.orders.smv}, ${schema.styles.smv}, 0))`,
      avail: sql<number>`sum(${schema.dailyProduction.manpower} * ${schema.dailyProduction.workingHours} * 60)`,
      days: sql<number>`count(distinct ${schema.dailyProduction.date})`,
    })
    .from(schema.dailyProduction)
    .innerJoin(schema.orders, eq(schema.dailyProduction.orderId, schema.orders.id))
    .leftJoin(schema.styles, eq(schema.orders.styleId, schema.styles.id))
    .where(gte(schema.dailyProduction.date, from))
    .groupBy(schema.dailyProduction.lineId);
  return (
    <Card title="Line efficiency – last 30 days" noPad>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Line</th>
            <th>Factory</th>
            <th className="num">Days</th>
            <th className="num">Target</th>
            <th className="num">Produced</th>
            <th className="num">Achieved %</th>
            <th className="num">Rejects</th>
            <th className="num">Reject %</th>
            <th className="num">Earned hrs</th>
            <th className="num">Avail hrs</th>
            <th className="num">Efficiency</th>
            <th className="num">Target eff.</th>
            <th>Gap</th>
          </tr>
        </thead>
        <tbody>
          {lines
            .map((l) => ({ l, r: rows.find((x) => x.lineId === l.id) }))
            .filter((x) => x.r)
            .map(({ l, r }) => {
              const eff = Number(r!.avail) ? Math.round((Number(r!.earned) / Number(r!.avail)) * 1000) / 10 : 0;
              return (
                <tr key={l.id}>
                  <td className="font-semibold">{l.name}</td>
                  <td className="text-slate-600">{l.factoryName}</td>
                  <td className="num">{Number(r!.days)}</td>
                  <td className="num">{fmtNum(Number(r!.target))}</td>
                  <td className="num">{fmtNum(Number(r!.produced))}</td>
                  <td className="num">{pct(Number(r!.produced), Number(r!.target))}%</td>
                  <td className="num text-red-600">{fmtNum(Number(r!.rejected))}</td>
                  <td className="num">{pct(Number(r!.rejected), Number(r!.produced) + Number(r!.rejected))}%</td>
                  <td className="num">{fmtNum(Number(r!.earned) / 60)}</td>
                  <td className="num">{fmtNum(Number(r!.avail) / 60)}</td>
                  <td className="num font-bold" style={{ color: eff >= l.efficiency ? "#16a34a" : "#d97706" }}>
                    {eff}%
                  </td>
                  <td className="num">{l.efficiency}%</td>
                  <td className="w-40">
                    <Progress value={pct(eff, l.efficiency)} color={eff >= l.efficiency ? "#16a34a" : "#d97706"} />
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState title="No production in the last 30 days" />}
    </Card>
  );
}

async function TnaReport() {
  const T = today();
  const rows = await db
    .select({
      department: schema.tnaTasks.department,
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${schema.tnaTasks.status} = 'Completed' then 1 else 0 end)`,
      late: sql<number>`sum(case when ${schema.tnaTasks.status} <> 'Completed' and ${schema.tnaTasks.plannedEnd} < ${T} then 1 else 0 end)`,
      completedLate: sql<number>`sum(case when ${schema.tnaTasks.status} = 'Completed' and ${schema.tnaTasks.actualEnd} > ${schema.tnaTasks.plannedEnd} then 1 else 0 end)`,
      avgSlip: sql<number>`avg(case when ${schema.tnaTasks.actualEnd} is not null then (${schema.tnaTasks.actualEnd} - ${schema.tnaTasks.plannedEnd}) end)`,
    })
    .from(schema.tnaTasks)
    .innerJoin(schema.orders, eq(schema.tnaTasks.orderId, schema.orders.id))
    .where(sql`${schema.orders.status} not in ('cancelled')`)
    .groupBy(schema.tnaTasks.department)
    .orderBy(schema.tnaTasks.department);
  return (
    <Card title="TNA performance by department" noPad>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Tasks</th>
            <th className="num">Completed</th>
            <th className="num">Open & late</th>
            <th className="num">Completed late</th>
            <th className="num">On-time %</th>
            <th className="num">Avg slip (days)</th>
            <th>Completion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const completed = Number(r.completed);
            const onTime = completed ? Math.round(((completed - Number(r.completedLate)) / completed) * 100) : 0;
            return (
              <tr key={r.department ?? "—"}>
                <td className="font-semibold">{r.department ?? "—"}</td>
                <td className="num">{Number(r.total)}</td>
                <td className="num">{completed}</td>
                <td className="num text-red-600">{Number(r.late)}</td>
                <td className="num text-amber-700">{Number(r.completedLate)}</td>
                <td className="num font-bold" style={{ color: onTime >= 90 ? "#16a34a" : onTime >= 75 ? "#d97706" : "#dc2626" }}>
                  {onTime}%
                </td>
                <td className="num">{r.avgSlip === null ? "—" : Number(r.avgSlip).toFixed(1)}</td>
                <td className="w-40">
                  <Progress value={pct(completed, Number(r.total))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState title="No TNA data" />}
    </Card>
  );
}
