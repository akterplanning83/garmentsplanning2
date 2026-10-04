import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getOrders } from "@/lib/queries";
import { today, addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const sv = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(sv) ? `"${sv.replace(/"/g, '""')}"` : sv;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const report = url.searchParams.get("report") ?? "orders";
  let rows: Record<string, unknown>[] = [];

  if (report === "orders") {
    const orders = await getOrders();
    rows = orders.map((o) => ({
      orderNo: o.orderNo,
      poNumber: o.poNumber,
      buyer: o.buyerName,
      styleNo: o.styleNo,
      style: o.styleName,
      orderDate: o.orderDate,
      shipDate: o.shipDate,
      quantity: o.quantity,
      unitPrice: o.unitPrice,
      value: o.quantity * o.unitPrice,
      currency: o.currency,
      smv: o.smv ?? o.styleSmv,
      status: o.status,
      priority: o.priority,
      plannedQty: o.allocatedQty,
      producedQty: o.producedQty,
      shippedQty: o.shippedQty,
      destination: o.destination,
      shipMode: o.shipMode,
    }));
  } else if (report === "materials") {
    const items = await db
      .select({
        orderNo: schema.orders.orderNo,
        item: schema.bomItems.itemName,
        type: schema.bomItems.itemType,
        supplier: schema.suppliers.name,
        unit: schema.bomItems.unit,
        consumption: schema.bomItems.consumption,
        wastagePct: schema.bomItems.wastagePct,
        requiredQty: schema.bomItems.requiredQty,
        receivedQty: schema.bomItems.receivedQty,
        unitPrice: schema.bomItems.unitPrice,
        status: schema.bomItems.status,
        eta: schema.bomItems.etaDate,
      })
      .from(schema.bomItems)
      .innerJoin(schema.orders, eq(schema.bomItems.orderId, schema.orders.id))
      .leftJoin(schema.suppliers, eq(schema.bomItems.supplierId, schema.suppliers.id))
      .orderBy(asc(schema.orders.orderNo));
    rows = items;
  } else if (report === "production") {
    const from = url.searchParams.get("from") ?? addDays(today(), -30);
    const to = url.searchParams.get("to") ?? today();
    const items = await db
      .select({
        date: schema.dailyProduction.date,
        line: schema.productionLines.name,
        orderNo: schema.orders.orderNo,
        process: schema.dailyProduction.process,
        target: schema.dailyProduction.targetQty,
        produced: schema.dailyProduction.producedQty,
        rejected: schema.dailyProduction.rejectedQty,
        manpower: schema.dailyProduction.manpower,
        hours: schema.dailyProduction.workingHours,
      })
      .from(schema.dailyProduction)
      .innerJoin(schema.orders, eq(schema.dailyProduction.orderId, schema.orders.id))
      .innerJoin(schema.productionLines, eq(schema.dailyProduction.lineId, schema.productionLines.id))
      .where(and(gte(schema.dailyProduction.date, from), lte(schema.dailyProduction.date, to)))
      .orderBy(asc(schema.dailyProduction.date));
    rows = items;
  } else if (report === "tna") {
    const items = await db
      .select({
        orderNo: schema.orders.orderNo,
        task: schema.tnaTasks.name,
        department: schema.tnaTasks.department,
        plannedStart: schema.tnaTasks.plannedStart,
        plannedEnd: schema.tnaTasks.plannedEnd,
        actualStart: schema.tnaTasks.actualStart,
        actualEnd: schema.tnaTasks.actualEnd,
        status: schema.tnaTasks.status,
        responsible: schema.tnaTasks.responsible,
      })
      .from(schema.tnaTasks)
      .innerJoin(schema.orders, eq(schema.tnaTasks.orderId, schema.orders.id))
      .orderBy(asc(schema.orders.orderNo), asc(schema.tnaTasks.sortOrder));
    rows = items;
  } else if (report === "plan") {
    const items = await db
      .select({
        line: schema.productionLines.name,
        orderNo: schema.orders.orderNo,
        process: schema.planAllocations.process,
        startDate: schema.planAllocations.startDate,
        endDate: schema.planAllocations.endDate,
        plannedQty: schema.planAllocations.plannedQty,
        dailyTarget: schema.planAllocations.dailyTarget,
        efficiency: schema.planAllocations.efficiency,
        status: schema.planAllocations.status,
      })
      .from(schema.planAllocations)
      .innerJoin(schema.orders, eq(schema.planAllocations.orderId, schema.orders.id))
      .innerJoin(schema.productionLines, eq(schema.planAllocations.lineId, schema.productionLines.id))
      .orderBy(asc(schema.planAllocations.startDate));
    rows = items;
  }

  const body = csv(rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-${today()}.csv"`,
    },
  });
}
