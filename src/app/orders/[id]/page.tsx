import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { AutoSubmitSelect, DeleteButton, InlineForm } from "@/components/client-bits";
import { Alert, Badge, Card, EmptyState, KV, PageHeader, Progress, Tabs } from "@/components/ui";
import { addBreakdownRow, allocatePlan, applyTnaTemplate, patchEntityForm, updateOrderStatusForm, updateTnaStatusForm } from "@/lib/actions";
import { customFieldDefs, getCustomFields, getLookups, getOrder, opts, withCustomInitial } from "@/lib/queries";
import { getSettings, statusMeta } from "@/lib/settings";
import { diffDays, fmtDate, today } from "@/lib/dates";
import { calcEfficiency, fmtMoney, fmtNum, lineDailyCapacity, pct } from "@/lib/planning";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

const TNA_COLORS: Record<string, string> = { Pending: "#64748b", "In Progress": "#2563eb", Completed: "#16a34a" };
const BOM_STATUS = ["Pending", "Booked", "Partial", "In-house"];
const BOM_COLORS: Record<string, string> = { Pending: "#dc2626", Booked: "#d97706", Partial: "#2563eb", "In-house": "#16a34a" };

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const orderId = Number(id);
  const s = await getSettings();
  const T = today();
  const order = await getOrder(orderId);
  if (!order) notFound();

  const [lk, cfs, breakdowns, bom, tna, allocs, prod, ships] = await Promise.all([
    getLookups(),
    getCustomFields("orders"),
    db.select().from(schema.orderBreakdowns).where(eq(schema.orderBreakdowns.orderId, orderId)),
    db
      .select({
        id: schema.bomItems.id,
        itemName: schema.bomItems.itemName,
        itemType: schema.bomItems.itemType,
        supplierId: schema.bomItems.supplierId,
        unit: schema.bomItems.unit,
        consumption: schema.bomItems.consumption,
        wastagePct: schema.bomItems.wastagePct,
        requiredQty: schema.bomItems.requiredQty,
        receivedQty: schema.bomItems.receivedQty,
        unitPrice: schema.bomItems.unitPrice,
        status: schema.bomItems.status,
        etaDate: schema.bomItems.etaDate,
        remarks: schema.bomItems.remarks,
        supplierName: schema.suppliers.name,
      })
      .from(schema.bomItems)
      .leftJoin(schema.suppliers, eq(schema.bomItems.supplierId, schema.suppliers.id))
      .where(eq(schema.bomItems.orderId, orderId))
      .orderBy(asc(schema.bomItems.id)),
    db.select().from(schema.tnaTasks).where(eq(schema.tnaTasks.orderId, orderId)).orderBy(asc(schema.tnaTasks.sortOrder), asc(schema.tnaTasks.plannedStart)),
    db.select().from(schema.planAllocations).where(eq(schema.planAllocations.orderId, orderId)).orderBy(asc(schema.planAllocations.startDate)),
    db.select().from(schema.dailyProduction).where(eq(schema.dailyProduction.orderId, orderId)).orderBy(desc(schema.dailyProduction.date)),
    db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(asc(schema.shipments.shipDate)),
  ]);

  const smv = order.smv ?? order.styleSmv ?? 0;
  const remaining = Math.max(0, order.quantity - order.allocatedQty);
  const tnaDone = tna.filter((t) => t.status === "Completed").length;
  const tnaLate = tna.filter((t) => t.status !== "Completed" && t.plannedEnd < T).length;
  const bomValue = bom.reduce((a, b) => a + b.requiredQty * b.unitPrice, 0);
  const bomInHouse = bom.filter((b) => b.status === "In-house").length;
  const totalBreakdown = breakdowns.reduce((a, b) => a + b.quantity, 0);
  const st = statusMeta(s.orderStatuses, order.status);
  const daysLeft = diffDays(T, order.shipDate);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "breakdown", label: "Color / Size", count: breakdowns.length },
    { key: "bom", label: "BOM / Materials", count: bom.length },
    { key: "tna", label: "TNA", count: tna.length },
    { key: "plan", label: "Line Plan", count: allocs.length },
    { key: "production", label: "Production", count: prod.length },
    { key: "shipments", label: "Shipments", count: ships.length },
  ].map((t) => ({ ...t, href: `/orders/${orderId}?tab=${t.key}` }));

  const orderFields: FieldDef[] = [
    { name: "orderNo", label: "Order no", required: true },
    { name: "poNumber", label: "PO number" },
    { name: "buyerId", label: "Buyer", type: "select", options: opts(lk.buyers, (b) => b.name), required: true },
    { name: "styleId", label: "Style", type: "select", options: opts(lk.styles, (x) => `${x.styleNo} · ${x.name}`), required: true },
    { name: "orderDate", label: "Order date", type: "date", required: true },
    { name: "shipDate", label: "Ship date", type: "date", required: true },
    { name: "quantity", label: "Quantity", type: "number", required: true },
    { name: "unitPrice", label: "Unit price", type: "number", step: "0.001" },
    { name: "currency", label: "Currency" },
    { name: "smv", label: "SMV override", type: "number", step: "0.01" },
    { name: "priority", label: "Priority", type: "select", options: s.priorities.map((p) => ({ value: p.key, label: p.label })) },
    { name: "shipMode", label: "Ship mode", type: "select", options: s.shipModes.map((m) => ({ value: m, label: m })) },
    { name: "destination", label: "Destination" },
    { name: "remarks", label: "Remarks", span: 2, type: "textarea" },
    ...customFieldDefs(cfs),
  ];

  const sewingLines = lk.lines.filter((l) => l.isActive);
  const planFields: FieldDef[] = [
    {
      name: "lineId",
      label: "Production line",
      type: "select",
      options: [{ value: "0", label: "⚡ Auto-select earliest free line" }, ...sewingLines.map((l) => ({ value: String(l.id), label: `${l.name} (${l.factoryName ?? ""}) · ${lineDailyCapacity(l, smv, s)} pcs/day` }))],
      required: true,
      span: 2,
    },
    { name: "process", label: "Process", type: "select", options: lk.processes.map((p) => ({ value: p.name, label: p.name })), defaultValue: s.planning.defaultProcess },
    { name: "startDate", label: "Start date", type: "date", required: true, defaultValue: T },
    { name: "plannedQty", label: "Planned qty", type: "number", required: true, defaultValue: remaining || order.quantity, help: `Remaining unplanned: ${fmtNum(remaining)}` },
    { name: "efficiency", label: "Efficiency % override", type: "number", step: "0.1", help: "Blank = line default" },
    { name: "dailyTarget", label: "Daily target override", type: "number", help: `Blank = auto from SMV ${smv.toFixed(2)}` },
    { name: "remarks", label: "Remarks" },
    { name: "__setInProduction", label: "Move order to In Production", type: "checkbox", defaultValue: order.status === "confirmed" },
  ];

  const bomFields: FieldDef[] = [
    { name: "itemName", label: "Item", required: true, span: 2 },
    { name: "itemType", label: "Type", type: "select", options: s.bomTypes.map((t) => ({ value: t, label: t })), required: true },
    { name: "supplierId", label: "Supplier", type: "select", options: opts(lk.suppliers, (x) => x.name) },
    { name: "unit", label: "Unit", type: "select", options: s.units.map((u) => ({ value: u, label: u })), defaultValue: "pcs" },
    { name: "consumption", label: "Consumption / pc", type: "number", step: "0.0001", required: true },
    { name: "wastagePct", label: "Wastage %", type: "number", step: "0.1", defaultValue: 3 },
    { name: "requiredQty", label: "Required qty", type: "number", step: "0.01", help: "Blank = qty × consumption × (1+wastage)" },
    { name: "receivedQty", label: "Received qty", type: "number", step: "0.01" },
    { name: "unitPrice", label: "Unit price", type: "number", step: "0.0001" },
    { name: "status", label: "Status", type: "select", options: BOM_STATUS.map((x) => ({ value: x, label: x })), defaultValue: "Pending" },
    { name: "etaDate", label: "ETA / in-house date", type: "date" },
    { name: "remarks", label: "Remarks", span: 2 },
  ];

  const tnaFields: FieldDef[] = [
    { name: "name", label: "Task", required: true, span: 2 },
    { name: "department", label: "Department", type: "select", options: lk.departments.map((d) => ({ value: d.name, label: d.name })) },
    { name: "responsible", label: "Responsible" },
    { name: "plannedStart", label: "Planned start", type: "date", required: true },
    { name: "plannedEnd", label: "Planned end", type: "date", required: true },
    { name: "actualStart", label: "Actual start", type: "date" },
    { name: "actualEnd", label: "Actual end", type: "date" },
    { name: "status", label: "Status", type: "select", options: Object.keys(TNA_COLORS).map((x) => ({ value: x, label: x })), defaultValue: "Pending" },
    { name: "sortOrder", label: "Sequence", type: "number", defaultValue: tna.length + 1 },
    { name: "remarks", label: "Remarks", span: 2 },
  ];

  const prodFields: FieldDef[] = [
    { name: "date", label: "Date", type: "date", required: true, defaultValue: T },
    { name: "lineId", label: "Line", type: "select", options: opts(sewingLines, (l) => l.name), required: true },
    { name: "process", label: "Process", type: "select", options: lk.processes.map((p) => ({ value: p.name, label: p.name })), defaultValue: "Sewing" },
    { name: "targetQty", label: "Target", type: "number" },
    { name: "producedQty", label: "Produced (good)", type: "number", required: true },
    { name: "rejectedQty", label: "Rejected", type: "number", defaultValue: 0 },
    { name: "manpower", label: "Manpower", type: "number", required: true },
    { name: "workingHours", label: "Hours worked", type: "number", step: "0.5", defaultValue: s.planning.workingHoursPerDay },
    { name: "remarks", label: "Remarks", span: 2 },
  ];

  const shipFields: FieldDef[] = [
    { name: "shipDate", label: "Ship date", type: "date", required: true, defaultValue: T },
    { name: "quantity", label: "Quantity", type: "number", required: true, defaultValue: Math.max(0, order.quantity - order.shippedQty) },
    { name: "mode", label: "Mode", type: "select", options: s.shipModes.map((m) => ({ value: m, label: m })) },
    { name: "invoiceNo", label: "Invoice no" },
    { name: "remarks", label: "Remarks", span: 2 },
  ];

  const breakdownFields: FieldDef[] = [
    { name: "colorId", label: "Color", type: "select", options: opts(lk.colors, (c) => c.name), required: true, span: 2 },
    ...lk.sizes.map((sz) => ({ name: `size_${sz.id}`, label: `Size ${sz.name}`, type: "number" as const, min: 0 })),
    { name: "__syncQty", label: "Update order quantity from breakdown total", type: "checkbox", span: 2 },
  ];

  const usedColorIds = Array.from(new Set(breakdowns.map((b) => b.colorId)));

  return (
    <>
      <PageHeader
        title={`${order.orderNo}`}
        subtitle={`${order.buyerName ?? "—"} · ${order.styleNo} ${order.styleName ?? ""} · PO ${order.poNumber ?? "—"}`}
        actions={
          <>
            <Link href="/orders" className="btn btn-ghost btn-sm">
              ← Orders
            </Link>
            <form action={updateOrderStatusForm.bind(null, orderId)} className="flex items-center gap-1">
              <span className="text-xs text-slate-500">Status</span>
              <AutoSubmitSelect name="status" defaultValue={order.status} className="inp inp-sm w-40" style={{ borderColor: st.color, color: st.color, fontWeight: 600 }}>
                {s.orderStatuses.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>
            <CrudModal entity="orders" title="Order" fields={orderFields} initial={withCustomInitial(order)} variant="secondary" trigger="✎ Edit" size="lg" />
            <DeleteButton entity="orders" id={orderId} label="Delete" redirectTo="/orders" confirmText="Delete this order with all breakdowns, BOM, TNA, plans and production? This cannot be undone." />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="card card-p">
          <div className="lbl">Quantity</div>
          <div className="text-lg font-bold">{fmtNum(order.quantity)}</div>
          <div className="text-[11px] text-slate-500">{fmtMoney(order.quantity * order.unitPrice, order.currency)}</div>
        </div>
        <div className="card card-p">
          <div className="lbl">Ship date</div>
          <div className="text-lg font-bold">{fmtDate(order.shipDate, s.company.dateFormat)}</div>
          <div className={`text-[11px] ${daysLeft < 0 ? "font-semibold text-red-600" : "text-slate-500"}`}>{daysLeft < 0 ? `${-daysLeft} days overdue` : `${daysLeft} days left`} · {order.shipMode}</div>
        </div>
        <div className="card card-p">
          <div className="lbl">Line planned</div>
          <div className="text-lg font-bold">{pct(order.allocatedQty, order.quantity)}%</div>
          <Progress value={pct(order.allocatedQty, order.quantity)} color="#7c3aed" />
        </div>
        <div className="card card-p">
          <div className="lbl">Produced</div>
          <div className="text-lg font-bold">{pct(order.producedQty, order.quantity)}%</div>
          <Progress value={pct(order.producedQty, order.quantity)} color="#0f766e" />
        </div>
        <div className="card card-p">
          <div className="lbl">TNA</div>
          <div className="text-lg font-bold">
            {tnaDone}/{tna.length}
          </div>
          <div className={`text-[11px] ${tnaLate ? "font-semibold text-red-600" : "text-slate-500"}`}>{tnaLate ? `${tnaLate} delayed` : "on track"}</div>
        </div>
        <div className="card card-p">
          <div className="lbl">Materials</div>
          <div className="text-lg font-bold">
            {bomInHouse}/{bom.length}
          </div>
          <div className="text-[11px] text-slate-500">in-house · {fmtMoney(bomValue, order.currency)}</div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} className="mb-4" />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card title="Order information">
            <KV k="Status" v={<Badge label={st.label} color={st.color} />} />
            <KV k="Priority" v={<Badge label={statusMeta(s.priorities, order.priority).label} color={statusMeta(s.priorities, order.priority).color} />} />
            <KV k="Buyer" v={order.buyerName ?? "—"} />
            <KV k="Style" v={<Link href={`/styles/${order.styleId}`} className="text-brand">{order.styleNo} · {order.styleName}</Link>} />
            <KV k="Order date" v={fmtDate(order.orderDate, s.company.dateFormat)} />
            <KV k="Ship date" v={fmtDate(order.shipDate, s.company.dateFormat)} />
            <KV k="Lead time" v={`${diffDays(order.orderDate, order.shipDate)} days`} />
            <KV k="Unit price" v={fmtMoney(order.unitPrice, order.currency)} />
            <KV k="SMV" v={`${smv.toFixed(2)} min ${order.smv ? "(override)" : "(style)"}`} />
            <KV k="Total SAM" v={`${fmtNum((order.quantity * smv) / 60)} hrs`} />
            <KV k="Destination" v={order.destination ?? "—"} />
            <KV k="TNA template" v={lk.templates.find((t) => t.id === order.tnaTemplateId)?.name ?? "—"} />
            {cfs.map((cf) => (
              <KV key={cf.id} k={cf.label} v={String((order.customData ?? {})[cf.fieldKey] ?? "—")} />
            ))}
            {order.remarks && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{order.remarks}</p>}
          </Card>
          <Card title="Critical path (next TNA milestones)" className="lg:col-span-2" noPad>
            <ul className="divide-y divide-slate-100">
              {tna
                .filter((t) => t.status !== "Completed")
                .slice(0, 8)
                .map((t) => {
                  const late = t.plannedEnd < T;
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <div>
                        <div className="font-medium text-slate-800">{t.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {t.department} · {fmtDate(t.plannedStart, s.company.dateFormat)} → {fmtDate(t.plannedEnd, s.company.dateFormat)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {late && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">{diffDays(t.plannedEnd, T)}d late</span>}
                        <Badge label={t.status} color={TNA_COLORS[t.status]} />
                      </div>
                    </li>
                  );
                })}
            </ul>
            {tna.length === 0 && <EmptyState title="No TNA generated" hint="Open the TNA tab and apply a template." />}
            {tna.length > 0 && tna.every((t) => t.status === "Completed") && <EmptyState title="All TNA tasks completed" />}
          </Card>
        </div>
      )}

      {tab === "breakdown" && (
        <Card
          title="Color / size breakdown"
          noPad
          actions={
            <>
              {totalBreakdown !== order.quantity && totalBreakdown > 0 && <span className="text-xs text-amber-600">Breakdown total {fmtNum(totalBreakdown)} ≠ order qty {fmtNum(order.quantity)}</span>}
              <CrudModal entity="orderBreakdowns" title="Color row" fields={breakdownFields} action={addBreakdownRow.bind(null, orderId)} variant="primary" submitLabel="Save row" />
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Color</th>
                  {lk.sizes.map((sz) => (
                    <th key={sz.id} className="num">
                      {sz.name}
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th className="num">%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usedColorIds.map((cid) => {
                  const c = lk.colors.find((x) => x.id === cid);
                  const rows = breakdowns.filter((b) => b.colorId === cid);
                  const total = rows.reduce((a, b) => a + b.quantity, 0);
                  const initial: Record<string, unknown> = { colorId: cid };
                  rows.forEach((r) => (initial[`size_${r.sizeId}`] = r.quantity));
                  return (
                    <tr key={cid ?? "none"}>
                      <td>
                        <span className="inline-flex items-center gap-2 font-medium">
                          <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ background: c?.hex ?? "#ccc" }} />
                          {c?.name ?? "No color"}
                        </span>
                      </td>
                      {lk.sizes.map((sz) => (
                        <td key={sz.id} className="num">
                          {fmtNum(rows.find((r) => r.sizeId === sz.id)?.quantity ?? 0)}
                        </td>
                      ))}
                      <td className="num font-semibold">{fmtNum(total)}</td>
                      <td className="num text-slate-500">{pct(total, totalBreakdown)}%</td>
                      <td className="whitespace-nowrap text-right">
                        <CrudModal entity="orderBreakdowns" title="Color row" fields={breakdownFields} initial={initial} action={addBreakdownRow.bind(null, orderId)} variant="icon" submitLabel="Update" />
                        {rows.map((r) => (
                          <span key={r.id} className="hidden" />
                        ))}
                      </td>
                    </tr>
                  );
                })}
                {breakdowns.length > 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td>Total</td>
                    {lk.sizes.map((sz) => (
                      <td key={sz.id} className="num">
                        {fmtNum(breakdowns.filter((b) => b.sizeId === sz.id).reduce((a, b) => a + b.quantity, 0))}
                      </td>
                    ))}
                    <td className="num">{fmtNum(totalBreakdown)}</td>
                    <td className="num">100%</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
            {breakdowns.length === 0 && <EmptyState title="No breakdown yet" hint="Add a color row and enter quantities per size." />}
          </div>
          {breakdowns.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
              Cells:{" "}
              {breakdowns.map((b) => (
                <span key={b.id} className="mr-2 inline-flex items-center gap-1">
                  {lk.colors.find((c) => c.id === b.colorId)?.name}/{lk.sizes.find((z) => z.id === b.sizeId)?.name}
                  <DeleteButton entity="orderBreakdowns" id={b.id} />
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "bom" && (
        <Card title="Bill of materials" noPad actions={<CrudModal entity="bomItems" title="BOM Item" fields={bomFields} hidden={{ orderId }} variant="primary" size="lg" />}>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Supplier</th>
                  <th className="num">Cons./pc</th>
                  <th className="num">Wastage</th>
                  <th className="num">Required</th>
                  <th className="num">Received</th>
                  <th className="num">Value</th>
                  <th>ETA</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bom.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.itemName}</td>
                    <td>
                      <Badge label={b.itemType} color="#7c3aed" />
                    </td>
                    <td className="text-slate-600">{b.supplierName ?? "—"}</td>
                    <td className="num">
                      {b.consumption} {b.unit}
                    </td>
                    <td className="num">{b.wastagePct}%</td>
                    <td className="num font-semibold">
                      {fmtNum(b.requiredQty, 2)} {b.unit}
                    </td>
                    <td className="num">
                      <div>{fmtNum(b.receivedQty, 2)}</div>
                      <Progress value={pct(b.receivedQty, b.requiredQty)} color="#16a34a" height={4} />
                    </td>
                    <td className="num">{fmtNum(b.requiredQty * b.unitPrice, 2)}</td>
                    <td className={b.etaDate && b.etaDate < T && b.status !== "In-house" ? "font-semibold text-red-600" : ""}>{fmtDate(b.etaDate, s.company.dateFormat)}</td>
                    <td>
                      <form action={patchEntityForm.bind(null, "bomItems", b.id)}>
                        <AutoSubmitSelect name="status" defaultValue={b.status} className="inp inp-sm" style={{ color: BOM_COLORS[b.status], fontWeight: 600 }}>
                          {BOM_STATUS.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="bomItems" title="BOM Item" fields={bomFields} initial={b} hidden={{ orderId }} variant="icon" size="lg" />
                      <DeleteButton entity="bomItems" id={b.id} />
                    </td>
                  </tr>
                ))}
                {bom.length > 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={7}>Total material cost</td>
                    <td className="num">{fmtNum(bomValue, 2)}</td>
                    <td colSpan={3} className="text-slate-500">
                      {order.quantity ? `${fmtNum(bomValue / order.quantity, 3)} / pc` : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {bom.length === 0 && <EmptyState title="No materials yet" hint="Add fabric, trims, and packaging with consumption to compute requirements." />}
          </div>
        </Card>
      )}

      {tab === "tna" && (
        <Card
          title="Time & Action calendar"
          noPad
          actions={
            <>
              <InlineForm action={applyTnaTemplate.bind(null, orderId)} submitLabel="Apply template">
                <select name="templateId" className="inp inp-sm" defaultValue={order.tnaTemplateId ?? ""} required>
                  <option value="">Choose template…</option>
                  {lk.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </InlineForm>
              <CrudModal entity="tnaTasks" title="Task" fields={tnaFields} hidden={{ orderId }} variant="primary" />
            </>
          }
        >
          {tnaLate > 0 && (
            <div className="px-4 pt-3">
              <Alert tone="danger">{tnaLate} task(s) are past their planned end date. Re-plan or update actuals.</Alert>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Task</th>
                  <th>Dept</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th className="num">Var (d)</th>
                  <th>Responsible</th>
                  <th>Status</th>
                  <th>Quick actions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tna.map((t, i) => {
                  const late = t.status !== "Completed" && t.plannedEnd < T;
                  const variance = t.actualEnd ? diffDays(t.plannedEnd, t.actualEnd) : late ? diffDays(t.plannedEnd, T) : null;
                  return (
                    <tr key={t.id} className={late ? "bg-red-50/40" : ""}>
                      <td className="text-slate-400">{i + 1}</td>
                      <td className="font-medium">{t.name}</td>
                      <td className="text-slate-600">{t.department ?? "—"}</td>
                      <td className="whitespace-nowrap text-xs">
                        {fmtDate(t.plannedStart, s.company.dateFormat)} → {fmtDate(t.plannedEnd, s.company.dateFormat)}
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-600">
                        {t.actualStart ? fmtDate(t.actualStart, s.company.dateFormat) : "—"} → {t.actualEnd ? fmtDate(t.actualEnd, s.company.dateFormat) : "—"}
                      </td>
                      <td className={`num font-semibold ${variance && variance > 0 ? "text-red-600" : "text-emerald-600"}`}>{variance === null ? "—" : variance > 0 ? `+${variance}` : variance}</td>
                      <td className="text-slate-600">{t.responsible ?? "—"}</td>
                      <td>
                        <Badge label={t.status} color={TNA_COLORS[t.status] ?? "#64748b"} />
                      </td>
                      <td className="whitespace-nowrap">
                        {t.status !== "In Progress" && t.status !== "Completed" && (
                          <form action={updateTnaStatusForm.bind(null, t.id)} className="inline">
                            <input type="hidden" name="status" value="In Progress" />
                            <button className="btn btn-secondary btn-xs">Start</button>
                          </form>
                        )}
                        {t.status !== "Completed" && (
                          <form action={updateTnaStatusForm.bind(null, t.id)} className="ml-1 inline">
                            <input type="hidden" name="status" value="Completed" />
                            <button className="btn btn-primary btn-xs">Complete</button>
                          </form>
                        )}
                        {t.status === "Completed" && (
                          <form action={updateTnaStatusForm.bind(null, t.id)} className="inline">
                            <input type="hidden" name="status" value="Pending" />
                            <button className="btn btn-ghost btn-xs">Reopen</button>
                          </form>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <CrudModal entity="tnaTasks" title="Task" fields={tnaFields} initial={t} hidden={{ orderId }} variant="icon" />
                        <DeleteButton entity="tnaTasks" id={t.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tna.length === 0 && <EmptyState title="No TNA tasks" hint="Apply a template to auto-generate the critical path from order & ship dates." />}
          </div>
        </Card>
      )}

      {tab === "plan" && (
        <div className="space-y-5">
          <Card
            title="Line allocations"
            noPad
            actions={
              <>
                <Link href="/planning" className="btn btn-ghost btn-sm">
                  Open board
                </Link>
                <CrudModal entity="planAllocations" title="Allocate to line" fields={planFields} action={allocatePlan} hidden={{ orderId }} variant="primary" submitLabel="Allocate" description="End date is computed from daily capacity and the working calendar." />
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Process</th>
                    <th>Start</th>
                    <th>End</th>
                    <th className="num">Days</th>
                    <th className="num">Daily target</th>
                    <th className="num">Planned qty</th>
                    <th className="num">Eff %</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allocs.map((a) => {
                    const line = lk.lines.find((l) => l.id === a.lineId);
                    const editFields: FieldDef[] = [
                      { name: "lineId", label: "Line", type: "select", options: opts(sewingLines, (l) => l.name), required: true },
                      { name: "process", label: "Process" },
                      { name: "startDate", label: "Start", type: "date", required: true },
                      { name: "endDate", label: "End", type: "date", required: true },
                      { name: "plannedQty", label: "Planned qty", type: "number", required: true },
                      { name: "dailyTarget", label: "Daily target", type: "number", required: true },
                      { name: "efficiency", label: "Efficiency %", type: "number", step: "0.1" },
                      { name: "status", label: "Status", type: "select", options: ["Planned", "Running", "Completed", "On Hold"].map((x) => ({ value: x, label: x })) },
                      { name: "remarks", label: "Remarks", span: 2 },
                    ];
                    return (
                      <tr key={a.id}>
                        <td>
                          <span className="inline-flex items-center gap-2 font-medium">
                            <span className="h-3 w-3 rounded" style={{ background: line?.colorHex ?? "#999" }} />
                            {line?.name ?? "—"}
                          </span>
                          <div className="text-[11px] text-slate-400">{line?.factoryName}</div>
                        </td>
                        <td>{a.process}</td>
                        <td>{fmtDate(a.startDate, s.company.dateFormat)}</td>
                        <td className={a.endDate > order.shipDate ? "font-semibold text-red-600" : ""}>{fmtDate(a.endDate, s.company.dateFormat)}</td>
                        <td className="num">{diffDays(a.startDate, a.endDate) + 1}</td>
                        <td className="num">{fmtNum(a.dailyTarget)}</td>
                        <td className="num font-semibold">{fmtNum(a.plannedQty)}</td>
                        <td className="num">{a.efficiency}%</td>
                        <td>
                          <Badge label={a.status} color={a.status === "Running" ? "#d97706" : a.status === "Completed" ? "#16a34a" : "#2563eb"} />
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <CrudModal entity="planAllocations" title="Allocation" fields={editFields} initial={a} hidden={{ orderId }} variant="icon" />
                          <DeleteButton entity="planAllocations" id={a.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {allocs.length === 0 && <EmptyState title="Not planned yet" hint={`Allocate ${fmtNum(order.quantity)} pcs to one or more lines.`} />}
            </div>
            {allocs.some((a) => a.endDate > order.shipDate) && (
              <div className="px-4 pb-3">
                <Alert tone="danger">Some allocations end after the ship date. Consider adding a line, overtime, or re-negotiating the ship date.</Alert>
              </div>
            )}
          </Card>
          <Card title={`Line capacity reference @ SMV ${smv.toFixed(2)}`} noPad>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Factory</th>
                    <th className="num">Operators</th>
                    <th className="num">Eff %</th>
                    <th className="num">Pcs / day</th>
                    <th className="num">Days for remaining ({fmtNum(remaining)})</th>
                  </tr>
                </thead>
                <tbody>
                  {sewingLines
                    .filter((l) => l.section === "Sewing")
                    .map((l) => {
                      const cap = lineDailyCapacity(l, smv, s);
                      return (
                        <tr key={l.id}>
                          <td className="font-medium">{l.name}</td>
                          <td className="text-slate-600">{l.factoryName}</td>
                          <td className="num">{l.operators}</td>
                          <td className="num">{l.efficiency}%</td>
                          <td className="num font-semibold">{fmtNum(cap)}</td>
                          <td className="num">{cap ? Math.ceil(remaining / cap) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "production" && (
        <Card title="Daily production" noPad actions={<CrudModal entity="dailyProduction" title="Production entry" fields={prodFields} hidden={{ orderId }} variant="primary" />}>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Line</th>
                  <th>Process</th>
                  <th className="num">Target</th>
                  <th className="num">Produced</th>
                  <th className="num">Rejected</th>
                  <th className="num">Achieved</th>
                  <th className="num">Manpower</th>
                  <th className="num">Hours</th>
                  <th className="num">Efficiency</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prod.map((p) => {
                  const line = lk.lines.find((l) => l.id === p.lineId);
                  const eff = calcEfficiency(p.producedQty, smv, p.manpower, p.workingHours);
                  return (
                    <tr key={p.id}>
                      <td>{fmtDate(p.date, s.company.dateFormat)}</td>
                      <td className="font-medium">{line?.name ?? "—"}</td>
                      <td>{p.process}</td>
                      <td className="num">{fmtNum(p.targetQty)}</td>
                      <td className="num font-semibold">{fmtNum(p.producedQty)}</td>
                      <td className="num text-red-600">{fmtNum(p.rejectedQty)}</td>
                      <td className="num">{p.targetQty ? `${pct(p.producedQty, p.targetQty)}%` : "—"}</td>
                      <td className="num">{p.manpower}</td>
                      <td className="num">{p.workingHours}</td>
                      <td className="num font-semibold" style={{ color: eff >= (line?.efficiency ?? 60) ? "#16a34a" : "#d97706" }}>
                        {eff}%
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <CrudModal entity="dailyProduction" title="Production entry" fields={prodFields} initial={p} hidden={{ orderId }} variant="icon" />
                        <DeleteButton entity="dailyProduction" id={p.id} />
                      </td>
                    </tr>
                  );
                })}
                {prod.length > 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={3}>Total</td>
                    <td className="num">{fmtNum(prod.reduce((a, p) => a + p.targetQty, 0))}</td>
                    <td className="num">{fmtNum(prod.reduce((a, p) => a + p.producedQty, 0))}</td>
                    <td className="num text-red-600">{fmtNum(prod.reduce((a, p) => a + p.rejectedQty, 0))}</td>
                    <td colSpan={5}></td>
                  </tr>
                )}
              </tbody>
            </table>
            {prod.length === 0 && <EmptyState title="No production recorded" />}
          </div>
        </Card>
      )}

      {tab === "shipments" && (
        <Card title="Shipments" noPad actions={<CrudModal entity="shipments" title="Shipment" fields={shipFields} hidden={{ orderId }} variant="primary" />}>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Ship date</th>
                  <th className="num">Quantity</th>
                  <th>Mode</th>
                  <th>Invoice</th>
                  <th>Remarks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ships.map((sh) => (
                  <tr key={sh.id}>
                    <td>{fmtDate(sh.shipDate, s.company.dateFormat)}</td>
                    <td className="num font-semibold">{fmtNum(sh.quantity)}</td>
                    <td>{sh.mode}</td>
                    <td>{sh.invoiceNo ?? "—"}</td>
                    <td className="text-slate-600">{sh.remarks ?? "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="shipments" title="Shipment" fields={shipFields} initial={sh} hidden={{ orderId }} variant="icon" />
                      <DeleteButton entity="shipments" id={sh.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ships.length === 0 && <EmptyState title="Nothing shipped yet" hint={`${fmtNum(order.quantity - order.shippedQty)} pcs pending shipment.`} />}
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Shipped {fmtNum(order.shippedQty)} of {fmtNum(order.quantity)} pcs ({pct(order.shippedQty, order.quantity)}%)
          </div>
        </Card>
      )}
    </>
  );
}
