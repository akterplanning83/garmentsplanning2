import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, sql } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { customFieldDefs, getCustomFields, withCustomInitial } from "@/lib/queries";
import type { FieldDef } from "@/lib/entities";
import { fmtNum } from "@/lib/planning";

export const dynamic = "force-dynamic";

export default async function BuyersPage() {
  const [buyers, cfs, stats] = await Promise.all([
    db.select().from(schema.buyers).orderBy(asc(schema.buyers.name)),
    getCustomFields("buyers"),
    db
      .select({ buyerId: schema.orders.buyerId, orders: sql<number>`count(*)`, qty: sql<number>`sum(${schema.orders.quantity})`, value: sql<number>`sum(${schema.orders.quantity} * ${schema.orders.unitPrice})` })
      .from(schema.orders)
      .where(sql`${schema.orders.status} not in ('cancelled')`)
      .groupBy(schema.orders.buyerId),
  ]);
  const styleCounts = await db.select({ buyerId: schema.styles.buyerId, c: sql<number>`count(*)` }).from(schema.styles).groupBy(schema.styles.buyerId);

  const fields: FieldDef[] = [
    { name: "name", label: "Buyer name", required: true },
    { name: "code", label: "Code", placeholder: "e.g. HM" },
    { name: "country", label: "Country" },
    { name: "contactPerson", label: "Contact person" },
    { name: "email", label: "Email" },
    { name: "phone", label: "Phone" },
    { name: "paymentTerms", label: "Payment terms", placeholder: "LC 90 days" },
    { name: "leadTimeDays", label: "Std. lead time (days)", type: "number" },
    { name: "address", label: "Address", type: "textarea", span: 2 },
    { name: "notes", label: "Notes", type: "textarea", span: 2 },
    ...customFieldDefs(cfs),
    { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
  ];

  return (
    <>
      <PageHeader title="Buyers" subtitle={`${buyers.length} buyers · custom fields: ${cfs.length}`} actions={<CrudModal entity="buyers" title="Buyer" fields={fields} />} />
      <Card noPad>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Country</th>
                <th>Contact</th>
                <th>Terms</th>
                <th className="num">Styles</th>
                <th className="num">Orders</th>
                <th className="num">Order qty</th>
                <th className="num">Value</th>
                {cfs.map((cf) => (
                  <th key={cf.id}>{cf.label}</th>
                ))}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => {
                const st = stats.find((x) => x.buyerId === b.id);
                const sc = styleCounts.find((x) => x.buyerId === b.id);
                return (
                  <tr key={b.id}>
                    <td>
                      <div className="font-semibold text-slate-800">{b.name}</div>
                      <div className="text-[11px] text-slate-400">{b.code}</div>
                    </td>
                    <td>{b.country ?? "—"}</td>
                    <td>
                      <div>{b.contactPerson ?? "—"}</div>
                      <div className="text-[11px] text-slate-400">{b.email}</div>
                    </td>
                    <td className="text-slate-600">{b.paymentTerms ?? "—"}</td>
                    <td className="num">{Number(sc?.c ?? 0)}</td>
                    <td className="num">{Number(st?.orders ?? 0)}</td>
                    <td className="num">{fmtNum(Number(st?.qty ?? 0))}</td>
                    <td className="num">{fmtNum(Number(st?.value ?? 0))}</td>
                    {cfs.map((cf) => (
                      <td key={cf.id} className="text-slate-600">
                        {String((b.customData ?? {})[cf.fieldKey] ?? "—")}
                      </td>
                    ))}
                    <td>
                      <Badge label={b.isActive ? "Active" : "Inactive"} color={b.isActive ? "#16a34a" : "#94a3b8"} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="buyers" title="Buyer" fields={fields} initial={withCustomInitial(b)} variant="icon" />
                      <DeleteButton entity="buyers" id={b.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {buyers.length === 0 && <EmptyState title="No buyers yet" hint="Add your first buyer to start creating styles and orders." />}
        </div>
      </Card>
    </>
  );
}
