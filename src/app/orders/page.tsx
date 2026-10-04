import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui";
import { getOrders } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { diffDays, fmtDate, today } from "@/lib/dates";
import { fmtMoney, fmtNum, pct } from "@/lib/planning";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; buyer?: string; q?: string; priority?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const s = await getSettings();
  const T = today();
  const [orders, buyers] = await Promise.all([getOrders(), db.select().from(schema.buyers).orderBy(asc(schema.buyers.name))]);

  let filtered = orders.filter((o) => {
    if (sp.status && o.status !== sp.status) return false;
    if (sp.buyer && String(o.buyerId) !== sp.buyer) return false;
    if (sp.priority && o.priority !== sp.priority) return false;
    if (sp.q) {
      const q = sp.q.toLowerCase();
      if (!`${o.orderNo} ${o.poNumber ?? ""} ${o.styleNo ?? ""} ${o.styleName ?? ""} ${o.buyerName ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  if (sp.sort === "qty") filtered = [...filtered].sort((a, b) => b.quantity - a.quantity);
  if (sp.sort === "value") filtered = [...filtered].sort((a, b) => b.quantity * b.unitPrice - a.quantity * a.unitPrice);
  if (sp.sort === "newest") filtered = [...filtered].sort((a, b) => b.id - a.id);

  const totalQty = filtered.reduce((a, o) => a + o.quantity, 0);
  const totalValue = filtered.reduce((a, o) => a + o.quantity * o.unitPrice, 0);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={`${filtered.length} orders · ${fmtNum(totalQty)} pcs · ${fmtMoney(totalValue, s.company.currency)}`}
        actions={
          <>
            <a href={`/api/export?report=orders`} className="btn btn-secondary btn-sm">
              ⇩ Export CSV
            </a>
            <Link href="/orders/new" className="btn btn-primary btn-sm">
              + New Order
            </Link>
          </>
        }
      />
      <Card className="mb-4">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search order / PO / style / buyer…" className="inp md:col-span-2" />
          <select name="status" defaultValue={sp.status ?? ""} className="inp">
            <option value="">All statuses</option>
            {s.orderStatuses.map((st) => (
              <option key={st.key} value={st.key}>
                {st.label}
              </option>
            ))}
          </select>
          <select name="buyer" defaultValue={sp.buyer ?? ""} className="inp">
            <option value="">All buyers</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sp.sort ?? ""} className="inp">
            <option value="">Sort: ship date</option>
            <option value="newest">Sort: newest</option>
            <option value="qty">Sort: quantity</option>
            <option value="value">Sort: value</option>
          </select>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm">Filter</button>
            <Link href="/orders" className="btn btn-ghost btn-sm">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card noPad>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Order / PO</th>
                <th>Buyer</th>
                <th>Style</th>
                <th>Order date</th>
                <th>Ship date</th>
                <th className="num">Qty</th>
                <th className="num">Value</th>
                <th className="num">SMV</th>
                <th>Planned</th>
                <th>Produced</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const d = diffDays(T, o.shipDate);
                const closed = o.status === "shipped" || o.status === "cancelled" || o.status === "completed";
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="font-semibold text-brand hover:underline">
                        {o.orderNo}
                      </Link>
                      <div className="text-[11px] text-slate-400">{o.poNumber}</div>
                    </td>
                    <td className="font-medium">{o.buyerName ?? "—"}</td>
                    <td>
                      <div>{o.styleNo}</div>
                      <div className="max-w-[180px] truncate text-[11px] text-slate-500">{o.styleName}</div>
                    </td>
                    <td>{fmtDate(o.orderDate, s.company.dateFormat)}</td>
                    <td>
                      <div>{fmtDate(o.shipDate, s.company.dateFormat)}</div>
                      {!closed && <div className={`text-[11px] ${d < 0 ? "font-semibold text-red-600" : d <= 7 ? "text-amber-600" : "text-slate-400"}`}>{d < 0 ? `${-d}d overdue` : `${d}d left`}</div>}
                    </td>
                    <td className="num font-semibold">{fmtNum(o.quantity)}</td>
                    <td className="num">{fmtNum(o.quantity * o.unitPrice)}</td>
                    <td className="num">{(o.smv ?? o.styleSmv ?? 0).toFixed(2)}</td>
                    <td className="w-24">
                      <Progress value={pct(o.allocatedQty, o.quantity)} color="#7c3aed" />
                      <div className="text-[11px] text-slate-500">{pct(o.allocatedQty, o.quantity)}%</div>
                    </td>
                    <td className="w-24">
                      <Progress value={pct(o.producedQty, o.quantity)} color="#0f766e" />
                      <div className="text-[11px] text-slate-500">{pct(o.producedQty, o.quantity)}%</div>
                    </td>
                    <td>
                      <Badge label={statusMeta(s.priorities, o.priority).label} color={statusMeta(s.priorities, o.priority).color} />
                    </td>
                    <td>
                      <Badge label={statusMeta(s.orderStatuses, o.status).label} color={statusMeta(s.orderStatuses, o.status).color} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              title="No orders match"
              hint="Try clearing filters or create a new order."
              action={
                <Link href="/orders/new" className="btn btn-primary btn-sm">
                  + New Order
                </Link>
              }
            />
          )}
        </div>
      </Card>
    </>
  );
}
