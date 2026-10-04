import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ensureSchema } from "@/db/bootstrap";

export type OrderRow = {
  id: number;
  orderNo: string;
  poNumber: string | null;
  buyerId: number | null;
  styleId: number | null;
  orderDate: string;
  shipDate: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  status: string;
  priority: string;
  destination: string | null;
  shipMode: string | null;
  smv: number | null;
  remarks: string | null;
  tnaTemplateId: number | null;
  customData: Record<string, unknown> | null;
  buyerName: string | null;
  styleNo: string | null;
  styleName: string | null;
  styleSmv: number | null;
  allocatedQty: number;
  producedQty: number;
  shippedQty: number;
};

const allocatedSq = db
  .select({ orderId: schema.planAllocations.orderId, qty: sql<number>`sum(${schema.planAllocations.plannedQty})`.as("alloc_qty") })
  .from(schema.planAllocations)
  .groupBy(schema.planAllocations.orderId)
  .as("alloc");

const producedSq = db
  .select({ orderId: schema.dailyProduction.orderId, qty: sql<number>`sum(${schema.dailyProduction.producedQty} - ${schema.dailyProduction.rejectedQty})`.as("prod_qty") })
  .from(schema.dailyProduction)
  .groupBy(schema.dailyProduction.orderId)
  .as("prod");

const shippedSq = db
  .select({ orderId: schema.shipments.orderId, qty: sql<number>`sum(${schema.shipments.quantity})`.as("ship_qty") })
  .from(schema.shipments)
  .groupBy(schema.shipments.orderId)
  .as("ship");

export async function getOrders(): Promise<OrderRow[]> {
  await ensureSchema();
  const rows = await db
    .select({
      id: schema.orders.id,
      orderNo: schema.orders.orderNo,
      poNumber: schema.orders.poNumber,
      buyerId: schema.orders.buyerId,
      styleId: schema.orders.styleId,
      orderDate: schema.orders.orderDate,
      shipDate: schema.orders.shipDate,
      quantity: schema.orders.quantity,
      unitPrice: schema.orders.unitPrice,
      currency: schema.orders.currency,
      status: schema.orders.status,
      priority: schema.orders.priority,
      destination: schema.orders.destination,
      shipMode: schema.orders.shipMode,
      smv: schema.orders.smv,
      remarks: schema.orders.remarks,
      tnaTemplateId: schema.orders.tnaTemplateId,
      customData: schema.orders.customData,
      buyerName: schema.buyers.name,
      styleNo: schema.styles.styleNo,
      styleName: schema.styles.name,
      styleSmv: schema.styles.smv,
      allocatedQty: sql<number>`coalesce(${allocatedSq.qty}, 0)`,
      producedQty: sql<number>`coalesce(${producedSq.qty}, 0)`,
      shippedQty: sql<number>`coalesce(${shippedSq.qty}, 0)`,
    })
    .from(schema.orders)
    .leftJoin(schema.buyers, eq(schema.orders.buyerId, schema.buyers.id))
    .leftJoin(schema.styles, eq(schema.orders.styleId, schema.styles.id))
    .leftJoin(allocatedSq, eq(allocatedSq.orderId, schema.orders.id))
    .leftJoin(producedSq, eq(producedSq.orderId, schema.orders.id))
    .leftJoin(shippedSq, eq(shippedSq.orderId, schema.orders.id))
    .orderBy(asc(schema.orders.shipDate), desc(schema.orders.id));
  return rows.map((r) => ({
    ...r,
    allocatedQty: Number(r.allocatedQty),
    producedQty: Number(r.producedQty),
    shippedQty: Number(r.shippedQty),
  }));
}

export async function getOrder(id: number): Promise<OrderRow | null> {
  const all = await getOrders();
  return all.find((o) => o.id === id) ?? null;
}

export async function getLines() {
  await ensureSchema();
  return db
    .select({
      id: schema.productionLines.id,
      factoryId: schema.productionLines.factoryId,
      name: schema.productionLines.name,
      code: schema.productionLines.code,
      section: schema.productionLines.section,
      operators: schema.productionLines.operators,
      helpers: schema.productionLines.helpers,
      machines: schema.productionLines.machines,
      workingHours: schema.productionLines.workingHours,
      efficiency: schema.productionLines.efficiency,
      colorHex: schema.productionLines.colorHex,
      sortOrder: schema.productionLines.sortOrder,
      isActive: schema.productionLines.isActive,
      factoryName: schema.factories.name,
    })
    .from(schema.productionLines)
    .leftJoin(schema.factories, eq(schema.productionLines.factoryId, schema.factories.id))
    .orderBy(asc(schema.productionLines.sortOrder), asc(schema.productionLines.id));
}

export type LineRow = Awaited<ReturnType<typeof getLines>>[number];

export async function getLookups() {
  await ensureSchema();
  const [buyers, styles, colors, sizes, categories, suppliers, departments, processes, templates, holidays, factories, lines] = await Promise.all([
    db.select().from(schema.buyers).orderBy(asc(schema.buyers.name)),
    db.select().from(schema.styles).orderBy(asc(schema.styles.styleNo)),
    db.select().from(schema.colors).orderBy(asc(schema.colors.name)),
    db.select().from(schema.sizes).orderBy(asc(schema.sizes.sortOrder)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.name)),
    db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    db.select().from(schema.departments).orderBy(asc(schema.departments.sortOrder)),
    db.select().from(schema.processes).orderBy(asc(schema.processes.sortOrder)),
    db.select().from(schema.tnaTemplates).orderBy(asc(schema.tnaTemplates.name)),
    db.select().from(schema.holidays).orderBy(asc(schema.holidays.date)),
    db.select().from(schema.factories).orderBy(asc(schema.factories.name)),
    getLines(),
  ]);
  return { buyers, styles, colors, sizes, categories, suppliers, departments, processes, templates, holidays, factories, lines };
}

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

export async function getCustomFields(entity: string) {
  await ensureSchema();
  return db.select().from(schema.customFields).where(eq(schema.customFields.entity, entity)).orderBy(asc(schema.customFields.sortOrder));
}

export function opts<T extends { id: number }>(rows: T[], label: (r: T) => string) {
  return rows.map((r) => ({ value: String(r.id), label: label(r) }));
}

export function customFieldDefs(rows: Awaited<ReturnType<typeof getCustomFields>>) {
  return rows.map((cf) => ({
    name: `cf_${cf.fieldKey}`,
    label: cf.label,
    type: (cf.type === "select" ? "select" : cf.type === "number" ? "number" : cf.type === "date" ? "date" : cf.type === "checkbox" ? "checkbox" : "text") as "select" | "number" | "date" | "checkbox" | "text",
    required: cf.required,
    options: cf.type === "select" ? (cf.options ?? "").split(",").map((o) => o.trim()).filter(Boolean).map((o) => ({ value: o, label: o })) : undefined,
  }));
}

/** Flatten customData into cf_ keys so CrudModal can prefill */
export function withCustomInitial<T extends { customData?: Record<string, unknown> | null }>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(row.customData ?? {})) out[`cf_${k}`] = v;
  return out;
}
