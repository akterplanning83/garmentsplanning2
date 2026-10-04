import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState, PageHeader, Progress, StatCard } from "@/components/ui";
import { getOrders } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { addDays, diffDays, fmtDate, monthLabel, today } from "@/lib/dates";
import { fmtMoney, fmtNum, pct } from "@/lib/planning";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const s = await getSettings();
  const T = today();
  const [orders, ships] = await Promise.all([
    getOrders(),
    db
      .select({
        id: schema.shipments.id,
        orderId: schema.shipments.orderId,
        shipDate: schema.shipments.shipDate,
        quantity: schema.shipments.quantity,
        mode: schema.shipments.mode,
        invoiceNo: schema.shipments.invoiceNo,
        remarks: schema.shipments.remarks,
        orderNo: schema.orders.orderNo,
        buyerName: schema.buyers.name,
        plannedShip: schema.orders.shipDate,
        unitPrice: schema.orders.unitPrice,
        currency: schema.orders.currency,
      })
      .from(schema.shipments)
      .innerJoin(schema.orders, eq(schema.shipments.orderId, schema.orders.id))
      .leftJoin(schema.buyers, eq(schema.orders.buyerId, schema.buyers.id))
      .orderBy(desc(schema.shipments.shipDate)),
  ]);

  const open = orders.filter((o) => ["confirmed", "in_production", "completed"].includes(o.status));
  const schedule = open.filter((o) => o.shippedQty < o.quantity).sort((a, b) => a.shipDate.localeCompare(b.shipDate));
  const overdue = schedule.filter((o) => o.shipDate < T);
  const next30 = schedule.filter((o) => o.shipDate >= T && o.shipDate <= addDays(T, 30));
  const shippedValue = ships.reduce((a, x) => a + x.quantity * x.unitPrice, 0);
  const onTime = ships.filter((x) => x.shipDate <= x.plannedShip).length;

  const months = Array.from(new Set(schedule.map((o) => o.shipDate.slice(0, 7)))).sort();

  const fields: FieldDef[] = [
    { name: "orderId", label: "Order", type: "select", options: open.map((o) => ({ value: String(o.id), label: `${o.orderNo} · ${o.buyerName} · pending ${fmtNum(o.quantity - o.shippedQty)}` })), required: true, span: 2 },
    { name: "shipDate", label: "Ship date", type: "date", required: true, defaultValue: T },
    { name: "quantity", label: "Quantity", type: "number", required: true },
    { name: "mode", label: "Mode", type: "select", options: s.shipModes.map((m) => ({ value: m, label: m })) },
    { name: "invoiceNo", label: "Invoice no" },
    { name: "remarks", label: "Remarks", span: 2 },
  ];

  return (
    <>
      <PageHeader title="Shipments" subtitle="Ex-factory schedule and shipped history" actions={<CrudModal entity="shipments" title="Shipment" fields={fields} variant="primary" />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Pending shipments" value={schedule.length} hint={`${fmtNum(schedule.reduce((a, o) => a + o.quantity - o.shippedQty, 0))} pcs`} icon="➤" color="#2563eb" />
        <StatCard label="Overdue" value={overdue.length} hint="past ship date" icon="!" color={overdue.length ? "#dc2626" : "#16a34a"} />
        <StatCard label="Next 30 days" value={next30.length} hint={`${fmtNum(next30.reduce((a, o) => a + o.quantity, 0))} pcs`} icon="◷" color="#d97706" />
        <StatCard label="Shipped (all time)" value={fmtNum(ships.reduce((a, x) => a + x.quantity, 0))} hint={fmtMoney(shippedValue, s.company.currency)} icon="✓" color="#0f766e" />
        <StatCard label="On-time rate" value={`${ships.length ? Math.round((onTime / ships.length) * 100) : 0}%`} hint={`${onTime}/${ships.length} shipments`} icon="◔" color="#7c3aed" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Ex-factory schedule" className="xl:col-span-2" noPad>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer / Style</th>
                  <th>Ship date</th>
                  <th>Mode / Dest.</th>
                  <th className="num">Qty</th>
                  <th>Production</th>
                  <th className="num">Shipped</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <MonthRows key={m} month={m} rows={schedule.filter((o) => o.shipDate.startsWith(m))} T={T} s={s} />
                ))}
              </tbody>
            </table>
            {schedule.length === 0 && <EmptyState title="Nothing pending" />}
          </div>
        </Card>
        <Card title="Shipped history" noPad>
          <ul className="divide-y divide-slate-100">
            {ships.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                <div>
                  <Link href={`/orders/${x.orderId}?tab=shipments`} className="font-semibold text-brand">
                    {x.orderNo}
                  </Link>
                  <div className="text-slate-500">
                    {x.buyerName} · {fmtDate(x.shipDate, s.company.dateFormat)} · {x.mode} · {x.invoiceNo ?? "no inv"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{fmtNum(x.quantity)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${x.shipDate <= x.plannedShip ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{x.shipDate <= x.plannedShip ? "on time" : `${diffDays(x.plannedShip, x.shipDate)}d late`}</span>
                  <DeleteButton entity="shipments" id={x.id} />
                </div>
              </li>
            ))}
          </ul>
          {ships.length === 0 && <EmptyState title="No shipments recorded" />}
        </Card>
      </div>
    </>
  );
}

function MonthRows({ month, rows, T, s }: { month: string; rows: Awaited<ReturnType<typeof getOrders>>; T: string; s: Awaited<ReturnType<typeof getSettings>> }) {
  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={8} className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {monthLabel(`${month}-01`)} · {rows.length} orders · {fmtNum(rows.reduce((a, o) => a + o.quantity - o.shippedQty, 0))} pcs
        </td>
      </tr>
      {rows.map((o) => {
        const d = diffDays(T, o.shipDate);
        return (
          <tr key={o.id}>
            <td>
              <Link href={`/orders/${o.id}?tab=shipments`} className="font-semibold text-brand hover:underline">
                {o.orderNo}
              </Link>
              <div className="text-[11px] text-slate-400">{o.poNumber}</div>
            </td>
            <td>
              <div className="font-medium">{o.buyerName}</div>
              <div className="text-[11px] text-slate-500">{o.styleName}</div>
            </td>
            <td>
              <div>{fmtDate(o.shipDate, s.company.dateFormat)}</div>
              <div className={`text-[11px] ${d < 0 ? "font-semibold text-red-600" : d <= 7 ? "text-amber-600" : "text-slate-400"}`}>{d < 0 ? `${-d}d overdue` : `${d}d`}</div>
            </td>
            <td className="text-slate-600">
              {o.shipMode} · {o.destination ?? "—"}
            </td>
            <td className="num font-semibold">{fmtNum(o.quantity)}</td>
            <td className="w-28">
              <Progress value={pct(o.producedQty, o.quantity)} color={pct(o.producedQty, o.quantity) >= 100 ? "#16a34a" : "#0f766e"} />
              <div className="text-[11px] text-slate-500">{pct(o.producedQty, o.quantity)}%</div>
            </td>
            <td className="num">{fmtNum(o.shippedQty)}</td>
            <td>
              <Badge label={statusMeta(s.orderStatuses, o.status).label} color={statusMeta(s.orderStatuses, o.status).color} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
