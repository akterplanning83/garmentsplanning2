import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { customFieldDefs, getCustomFields, opts, withCustomInitial } from "@/lib/queries";
import type { FieldDef } from "@/lib/entities";
import { fmtNum } from "@/lib/planning";

export const dynamic = "force-dynamic";

const STYLE_STATUS: Record<string, string> = { Development: "#64748b", Approved: "#2563eb", Running: "#16a34a", Closed: "#94a3b8" };

export default async function StylesPage({ searchParams }: { searchParams: Promise<{ buyer?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const [styles, buyers, categories, cfs, orderStats] = await Promise.all([
    db
      .select({
        id: schema.styles.id,
        styleNo: schema.styles.styleNo,
        name: schema.styles.name,
        buyerId: schema.styles.buyerId,
        categoryId: schema.styles.categoryId,
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
      .orderBy(asc(schema.styles.styleNo)),
    db.select().from(schema.buyers).orderBy(asc(schema.buyers.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.name)),
    getCustomFields("styles"),
    db.select({ styleId: schema.orders.styleId, c: sql<number>`count(*)`, qty: sql<number>`sum(${schema.orders.quantity})` }).from(schema.orders).groupBy(schema.orders.styleId),
  ]);

  const filtered = styles.filter((st) => {
    if (sp.buyer && String(st.buyerId) !== sp.buyer) return false;
    if (sp.status && st.status !== sp.status) return false;
    if (sp.q) {
      const q = sp.q.toLowerCase();
      if (!`${st.styleNo} ${st.name} ${st.fabricDetails ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const fields: FieldDef[] = [
    { name: "styleNo", label: "Style no", placeholder: "auto if blank" },
    { name: "name", label: "Style name", required: true },
    { name: "buyerId", label: "Buyer", type: "select", options: opts(buyers, (b) => b.name), required: true },
    { name: "categoryId", label: "Category", type: "select", options: opts(categories, (c) => `${c.name} (${c.garmentType})`) },
    { name: "garmentType", label: "Garment type", type: "select", options: ["Knit", "Woven", "Sweater", "Denim", "Lingerie", "Outerwear"].map((v) => ({ value: v, label: v })), defaultValue: "Knit" },
    { name: "season", label: "Season", placeholder: "SS26" },
    { name: "smv", label: "SMV (minutes)", type: "number", step: "0.01", required: true, help: "Standard minute value – drives capacity" },
    { name: "status", label: "Status", type: "select", options: Object.keys(STYLE_STATUS).map((v) => ({ value: v, label: v })), defaultValue: "Development", required: true },
    { name: "fabricDetails", label: "Fabric details", span: 2, placeholder: "100% Cotton S/J 160 GSM" },
    { name: "imageUrl", label: "Image URL", span: 2 },
    { name: "description", label: "Description", type: "textarea", span: 2 },
    ...customFieldDefs(cfs),
  ];

  return (
    <>
      <PageHeader title="Styles" subtitle={`${styles.length} styles · SMV library for capacity planning`} actions={<CrudModal entity="styles" title="Style" fields={fields} size="lg" />} />
      <Card className="mb-4">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search style / fabric…" className="inp md:col-span-2" />
          <select name="buyer" defaultValue={sp.buyer ?? ""} className="inp">
            <option value="">All buyers</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={sp.status ?? ""} className="inp">
            <option value="">All statuses</option>
            {Object.keys(STYLE_STATUS).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm">Filter</button>
            <Link href="/styles" className="btn btn-ghost btn-sm">
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
                <th>Style</th>
                <th>Buyer</th>
                <th>Category</th>
                <th>Season</th>
                <th>Fabric</th>
                <th className="num">SMV</th>
                <th className="num">Orders</th>
                <th className="num">Total qty</th>
                {cfs.map((cf) => (
                  <th key={cf.id}>{cf.label}</th>
                ))}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((st) => {
                const os = orderStats.find((x) => x.styleId === st.id);
                return (
                  <tr key={st.id}>
                    <td>
                      <Link href={`/styles/${st.id}`} className="font-semibold text-brand hover:underline">
                        {st.styleNo}
                      </Link>
                      <div className="text-xs text-slate-600">{st.name}</div>
                    </td>
                    <td>{st.buyerName ?? "—"}</td>
                    <td>
                      <div>{st.categoryName ?? "—"}</div>
                      <div className="text-[11px] text-slate-400">{st.garmentType}</div>
                    </td>
                    <td>{st.season ?? "—"}</td>
                    <td className="max-w-[220px] truncate text-slate-600" title={st.fabricDetails ?? ""}>
                      {st.fabricDetails ?? "—"}
                    </td>
                    <td className="num font-semibold">{st.smv.toFixed(2)}</td>
                    <td className="num">{Number(os?.c ?? 0)}</td>
                    <td className="num">{fmtNum(Number(os?.qty ?? 0))}</td>
                    {cfs.map((cf) => (
                      <td key={cf.id} className="text-slate-600">
                        {String((st.customData ?? {})[cf.fieldKey] ?? "—")}
                      </td>
                    ))}
                    <td>
                      <Badge label={st.status} color={STYLE_STATUS[st.status] ?? "#64748b"} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="styles" title="Style" fields={fields} initial={withCustomInitial(st)} variant="icon" size="lg" />
                      <DeleteButton entity="styles" id={st.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState title="No styles found" hint="Adjust filters or create a new style." />}
        </div>
      </Card>
    </>
  );
}
