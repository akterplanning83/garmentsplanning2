import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState, KV, PageHeader } from "@/components/ui";
import { getOrders, getCustomFields } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/planning";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function StyleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const styleId = Number(id);
  const s = await getSettings();
  const [style] = await db
    .select({
      id: schema.styles.id,
      styleNo: schema.styles.styleNo,
      name: schema.styles.name,
      garmentType: schema.styles.garmentType,
      season: schema.styles.season,
      description: schema.styles.description,
      fabricDetails: schema.styles.fabricDetails,
      smv: schema.styles.smv,
      status: schema.styles.status,
      imageUrl: schema.styles.imageUrl,
      customData: schema.styles.customData,
      buyerName: schema.buyers.name,
      categoryName: schema.categories.name,
    })
    .from(schema.styles)
    .leftJoin(schema.buyers, eq(schema.styles.buyerId, schema.buyers.id))
    .leftJoin(schema.categories, eq(schema.styles.categoryId, schema.categories.id))
    .where(eq(schema.styles.id, styleId));
  if (!style) notFound();

  const [ops, allOrders, cfs] = await Promise.all([
    db.select().from(schema.styleOperations).where(eq(schema.styleOperations.styleId, styleId)).orderBy(asc(schema.styleOperations.sortOrder)),
    getOrders(),
    getCustomFields("styles"),
  ]);
  const orders = allOrders.filter((o) => o.styleId === styleId);
  const opSmv = ops.reduce((a, o) => a + o.smv, 0);

  const opFields: FieldDef[] = [
    { name: "name", label: "Operation", required: true, span: 2 },
    { name: "machineType", label: "Machine type", placeholder: "Overlock 4T / Flatlock / Plain" },
    { name: "smv", label: "SMV", type: "number", step: "0.01", required: true },
    { name: "sortOrder", label: "Sequence", type: "number", defaultValue: ops.length + 1 },
  ];

  return (
    <>
      <PageHeader
        title={`${style.styleNo} · ${style.name}`}
        subtitle={`${style.buyerName ?? "—"} · ${style.categoryName ?? style.garmentType}`}
        actions={
          <>
            <Link href="/styles" className="btn btn-ghost btn-sm">
              ← Styles
            </Link>
            <Link href={`/orders/new?styleId=${style.id}`} className="btn btn-primary btn-sm">
              + Order for this style
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Style information">
          {style.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={style.imageUrl} alt={style.name} className="mb-3 h-40 w-full rounded-lg object-cover" />
          )}
          <KV k="Status" v={<Badge label={style.status} color={style.status === "Running" ? "#16a34a" : "#2563eb"} />} />
          <KV k="Garment type" v={style.garmentType ?? "—"} />
          <KV k="Season" v={style.season ?? "—"} />
          <KV k="SMV (style)" v={<b>{style.smv.toFixed(2)} min</b>} />
          <KV k="SMV (from OB)" v={opSmv ? `${opSmv.toFixed(2)} min` : "—"} />
          <KV k="Fabric" v={style.fabricDetails ?? "—"} />
          {cfs.map((cf) => (
            <KV key={cf.id} k={cf.label} v={String((style.customData ?? {})[cf.fieldKey] ?? "—")} />
          ))}
          {style.description && <p className="mt-3 text-xs text-slate-500">{style.description}</p>}
        </Card>

        <Card
          title={`Operation bulletin (${ops.length} ops)`}
          className="lg:col-span-2"
          noPad
          actions={<CrudModal entity="styleOperations" title="Operation" fields={opFields} hidden={{ styleId }} variant="secondary" />}
        >
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Operation</th>
                  <th>Machine</th>
                  <th className="num">SMV</th>
                  <th className="num">Target / hr @100%</th>
                  <th className="num">Target / hr @{s.planning.defaultEfficiency}%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ops.map((op) => (
                  <tr key={op.id}>
                    <td className="text-slate-400">{op.sortOrder}</td>
                    <td className="font-medium">{op.name}</td>
                    <td className="text-slate-600">{op.machineType ?? "—"}</td>
                    <td className="num">{op.smv.toFixed(2)}</td>
                    <td className="num">{op.smv ? Math.floor(60 / op.smv) : "—"}</td>
                    <td className="num">{op.smv ? Math.floor((60 / op.smv) * (s.planning.defaultEfficiency / 100)) : "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="styleOperations" title="Operation" fields={opFields} initial={op} hidden={{ styleId }} variant="icon" />
                      <DeleteButton entity="styleOperations" id={op.id} />
                    </td>
                  </tr>
                ))}
                {ops.length > 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={3}>Total</td>
                    <td className="num">{opSmv.toFixed(2)}</td>
                    <td className="num">{opSmv ? Math.floor(60 / opSmv) : "—"}</td>
                    <td className="num">{opSmv ? Math.floor((60 / opSmv) * (s.planning.defaultEfficiency / 100)) : "—"}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
            {ops.length === 0 && <EmptyState title="No operations defined" hint="Break the style down into sewing operations to build an operation bulletin and validate SMV." />}
          </div>
        </Card>
      </div>

      <Card title={`Orders using this style (${orders.length})`} className="mt-5" noPad>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>PO</th>
                <th>Order date</th>
                <th>Ship date</th>
                <th className="num">Qty</th>
                <th className="num">Produced</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="font-semibold text-brand hover:underline">
                      {o.orderNo}
                    </Link>
                  </td>
                  <td>{o.poNumber}</td>
                  <td>{fmtDate(o.orderDate, s.company.dateFormat)}</td>
                  <td>{fmtDate(o.shipDate, s.company.dateFormat)}</td>
                  <td className="num">{fmtNum(o.quantity)}</td>
                  <td className="num">{fmtNum(o.producedQty)}</td>
                  <td>
                    <Badge label={statusMeta(s.orderStatuses, o.status).label} color={statusMeta(s.orderStatuses, o.status).color} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <EmptyState title="No orders yet" />}
        </div>
      </Card>
    </>
  );
}
