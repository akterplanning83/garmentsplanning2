import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { AutoSubmitSelect } from "@/components/client-bits";
import { Badge, Card, EmptyState, PageHeader, Progress, StatCard } from "@/components/ui";
import { patchEntityForm } from "@/lib/actions";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, today } from "@/lib/dates";
import { fmtMoney, fmtNum, pct } from "@/lib/planning";

export const dynamic = "force-dynamic";

const BOM_STATUS = ["Pending", "Booked", "Partial", "In-house"];
const BOM_COLORS: Record<string, string> = { Pending: "#dc2626", Booked: "#d97706", Partial: "#2563eb", "In-house": "#16a34a" };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; supplier?: string; q?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const T = today();

  const [items, suppliers] = await Promise.all([
    db
      .select({
        id: schema.bomItems.id,
        itemName: schema.bomItems.itemName,
        itemType: schema.bomItems.itemType,
        unit: schema.bomItems.unit,
        requiredQty: schema.bomItems.requiredQty,
        receivedQty: schema.bomItems.receivedQty,
        unitPrice: schema.bomItems.unitPrice,
        status: schema.bomItems.status,
        etaDate: schema.bomItems.etaDate,
        supplierId: schema.bomItems.supplierId,
        supplierName: schema.suppliers.name,
        orderId: schema.orders.id,
        orderNo: schema.orders.orderNo,
        shipDate: schema.orders.shipDate,
        orderStatus: schema.orders.status,
        buyerName: schema.buyers.name,
      })
      .from(schema.bomItems)
      .innerJoin(schema.orders, eq(schema.bomItems.orderId, schema.orders.id))
      .leftJoin(schema.suppliers, eq(schema.bomItems.supplierId, schema.suppliers.id))
      .leftJoin(schema.buyers, eq(schema.orders.buyerId, schema.buyers.id))
      .where(sql`${schema.orders.status} in ('inquiry','confirmed','in_production')`)
      .orderBy(asc(schema.bomItems.etaDate)),
    db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);

  const list = items.filter((i) => {
    if (sp.status && i.status !== sp.status) return false;
    if (sp.type && i.itemType !== sp.type) return false;
    if (sp.supplier && String(i.supplierId) !== sp.supplier) return false;
    if (sp.q && !`${i.itemName} ${i.orderNo} ${i.buyerName ?? ""} ${i.supplierName ?? ""}`.toLowerCase().includes(sp.q.toLowerCase())) return false;
    return true;
  });

  const pending = items.filter((i) => i.status !== "In-house");
  const overdue = pending.filter((i) => i.etaDate && i.etaDate < T);
  const dueSoon = pending.filter((i) => i.etaDate && i.etaDate >= T && i.etaDate <= addDays(T, 7));
  const totalValue = items.reduce((a, i) => a + i.requiredQty * i.unitPrice, 0);
  const pendingValue = pending.reduce((a, i) => a + (i.requiredQty - i.receivedQty) * i.unitPrice, 0);

  const byType = s.bomTypes.map((t) => {
    const rows = items.filter((i) => i.itemType === t);
    return { t, total: rows.length, inHouse: rows.filter((r) => r.status === "In-house").length };
  });

  return (
    <>
      <PageHeader title="Materials / BOM" subtitle="Fabric, trims & packaging requirement and in-house status across active orders" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="BOM lines" value={items.length} hint={`${items.length - pending.length} in-house`} icon="▣" color="#0f766e" />
        <StatCard label="Pending items" value={pending.length} hint="not yet in-house" icon="◔" color="#d97706" />
        <StatCard label="Overdue ETA" value={overdue.length} hint="material risk!" icon="!" color={overdue.length ? "#dc2626" : "#16a34a"} />
        <StatCard label="Due ≤ 7 days" value={dueSoon.length} icon="➤" color="#2563eb" />
        <StatCard label="Material value" value={fmtMoney(totalValue, s.company.currency)} hint={`${fmtMoney(pendingValue, s.company.currency)} outstanding`} icon="$" color="#7c3aed" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-4">
        <Card title="Readiness by type">
          <div className="space-y-2.5">
            {byType
              .filter((x) => x.total > 0)
              .map((x) => (
                <div key={x.t}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{x.t}</span>
                    <span className="text-slate-500">
                      {x.inHouse}/{x.total}
                    </span>
                  </div>
                  <Progress value={pct(x.inHouse, x.total)} color="#16a34a" height={8} />
                </div>
              ))}
          </div>
        </Card>

        <Card className="xl:col-span-3" noPad>
          <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search item / order / supplier…" className="inp inp-sm w-52" />
            <select name="status" defaultValue={sp.status ?? ""} className="inp inp-sm w-32">
              <option value="">All status</option>
              {BOM_STATUS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select name="type" defaultValue={sp.type ?? ""} className="inp inp-sm w-32">
              <option value="">All types</option>
              {s.bomTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select name="supplier" defaultValue={sp.supplier ?? ""} className="inp inp-sm w-44">
              <option value="">All suppliers</option>
              {suppliers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary btn-xs">Filter</button>
            <Link href="/materials" className="btn btn-ghost btn-xs">
              Reset
            </Link>
            <a href="/api/export?report=materials" className="btn btn-ghost btn-xs ml-auto">
              ⇩ CSV
            </a>
          </form>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Order</th>
                  <th>Supplier</th>
                  <th className="num">Required</th>
                  <th className="num">Received</th>
                  <th className="num">Value</th>
                  <th>ETA</th>
                  <th>Ship date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => {
                  const late = i.etaDate && i.etaDate < T && i.status !== "In-house";
                  return (
                    <tr key={i.id} className={late ? "bg-red-50/40" : ""}>
                      <td>
                        <div className="font-medium">{i.itemName}</div>
                        <Badge label={i.itemType} color="#7c3aed" />
                      </td>
                      <td>
                        <Link href={`/orders/${i.orderId}?tab=bom`} className="font-semibold text-brand hover:underline">
                          {i.orderNo}
                        </Link>
                        <div className="text-[11px] text-slate-500">{i.buyerName}</div>
                      </td>
                      <td className="text-slate-600">{i.supplierName ?? "—"}</td>
                      <td className="num">
                        {fmtNum(i.requiredQty, 2)} {i.unit}
                      </td>
                      <td className="num w-28">
                        <div>{fmtNum(i.receivedQty, 2)}</div>
                        <Progress value={pct(i.receivedQty, i.requiredQty)} color="#16a34a" height={4} />
                      </td>
                      <td className="num">{fmtNum(i.requiredQty * i.unitPrice, 2)}</td>
                      <td className={late ? "font-semibold text-red-600" : ""}>{fmtDate(i.etaDate, s.company.dateFormat)}</td>
                      <td>{fmtDate(i.shipDate, s.company.dateFormat)}</td>
                      <td>
                        <form action={patchEntityForm.bind(null, "bomItems", i.id)}>
                          <AutoSubmitSelect name="status" defaultValue={i.status} className="inp inp-sm" style={{ color: BOM_COLORS[i.status], fontWeight: 600 }}>
                            {BOM_STATUS.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </AutoSubmitSelect>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 && <EmptyState title="No BOM items match" hint="Add materials from an order's BOM tab." />}
          </div>
        </Card>
      </div>
    </>
  );
}
