import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, sql } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { FieldDef } from "@/lib/entities";
import { getSettings } from "@/lib/settings";
import { fmtNum } from "@/lib/planning";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const s = await getSettings();
  const [suppliers, stats] = await Promise.all([
    db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    db
      .select({
        supplierId: schema.bomItems.supplierId,
        items: sql<number>`count(*)`,
        pending: sql<number>`sum(case when ${schema.bomItems.status} <> 'In-house' then 1 else 0 end)`,
        value: sql<number>`sum(${schema.bomItems.requiredQty} * ${schema.bomItems.unitPrice})`,
      })
      .from(schema.bomItems)
      .groupBy(schema.bomItems.supplierId),
  ]);

  const fields: FieldDef[] = [
    { name: "name", label: "Supplier name", required: true },
    { name: "code", label: "Code" },
    { name: "type", label: "Supply type", type: "select", options: s.bomTypes.map((t) => ({ value: t, label: t })), required: true, defaultValue: s.bomTypes[0] },
    { name: "country", label: "Country" },
    { name: "contactPerson", label: "Contact person" },
    { name: "email", label: "Email" },
    { name: "phone", label: "Phone" },
    { name: "leadTimeDays", label: "Lead time (days)", type: "number" },
    { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
  ];

  return (
    <>
      <PageHeader title="Suppliers" subtitle="Fabric mills, trims, accessories & packaging vendors" actions={<CrudModal entity="suppliers" title="Supplier" fields={fields} />} />
      <Card noPad>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Type</th>
                <th>Country</th>
                <th>Contact</th>
                <th className="num">Lead time</th>
                <th className="num">BOM lines</th>
                <th className="num">Pending</th>
                <th className="num">Booked value</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((sp) => {
                const st = stats.find((x) => x.supplierId === sp.id);
                return (
                  <tr key={sp.id}>
                    <td>
                      <div className="font-semibold text-slate-800">{sp.name}</div>
                      <div className="text-[11px] text-slate-400">{sp.code}</div>
                    </td>
                    <td>
                      <Badge label={sp.type} color="#7c3aed" />
                    </td>
                    <td>{sp.country ?? "—"}</td>
                    <td>
                      <div>{sp.contactPerson ?? "—"}</div>
                      <div className="text-[11px] text-slate-400">{sp.email}</div>
                    </td>
                    <td className="num">{sp.leadTimeDays ? `${sp.leadTimeDays} d` : "—"}</td>
                    <td className="num">{Number(st?.items ?? 0)}</td>
                    <td className="num text-amber-700">{Number(st?.pending ?? 0)}</td>
                    <td className="num">{fmtNum(Number(st?.value ?? 0))}</td>
                    <td>
                      <Badge label={sp.isActive ? "Active" : "Inactive"} color={sp.isActive ? "#16a34a" : "#94a3b8"} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="suppliers" title="Supplier" fields={fields} initial={sp} variant="icon" />
                      <DeleteButton entity="suppliers" id={sp.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {suppliers.length === 0 && <EmptyState title="No suppliers yet" hint="Add fabric, trims and packaging suppliers to track material bookings." />}
        </div>
      </Card>
    </>
  );
}
