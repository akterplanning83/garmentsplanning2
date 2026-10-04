"use server";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, eq, getTableColumns, sql, asc } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { entityRegistry, isEntityKey, type ActionResult } from "./entities";
import { getSettings, MODULE_LIST } from "./settings";
import { addDays, endDateForWorkingDays, isValidTimeZone, today } from "./dates";
import { lineDailyCapacity } from "./planning";
import { seedDatabase, clearDatabase } from "@/db/seed-data";

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */
function columnsOf(table: PgTable): Record<string, PgColumn> {
  return getTableColumns(table) as unknown as Record<string, PgColumn>;
}

function coerceFormData(table: PgTable, fd: FormData): Record<string, unknown> {
  const cols = columnsOf(table);
  const data: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  let hasCustom = false;

  for (const [key, raw] of fd.entries()) {
    if (typeof raw !== "string") continue;
    if (key.startsWith("cf_")) {
      custom[key.slice(3)] = raw;
      hasCustom = true;
      continue;
    }
    if (key.startsWith("__") || key === "id") continue;
    const col = cols[key];
    if (!col) continue;
    const v = raw.trim();
    switch (col.dataType) {
      case "number":
        data[key] = v === "" ? (col.notNull ? 0 : null) : Number(v);
        break;
      case "boolean":
        data[key] = v === "on" || v === "true" || v === "1";
        break;
      case "json":
        try {
          data[key] = v ? JSON.parse(v) : null;
        } catch {
          data[key] = null;
        }
        break;
      case "date":
        data[key] = v ? new Date(v) : null;
        break;
      default:
        data[key] = v === "" ? (col.notNull ? "" : null) : v;
    }
  }
  if (hasCustom && cols["customData"]) data.customData = custom;
  return data;
}

async function nextNumber(table: PgTable, prefix: string, padding: number): Promise<string> {
  const idCol = columnsOf(table).id;
  const [row] = await db.select({ max: sql<number>`coalesce(max(${idCol}), 0)` }).from(table);
  const n = Number(row?.max ?? 0) + 1;
  return `${prefix}${String(n).padStart(padding, "0")}`;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ */
/*  Generic CRUD                                                       */
/* ------------------------------------------------------------------ */
export async function saveEntity(entity: string, fd: FormData): Promise<ActionResult> {
  if (!isEntityKey(entity)) return { ok: false, error: "Unknown entity" };
  const { table } = entityRegistry[entity];
  const data = coerceFormData(table, fd);
  const idRaw = fd.get("id");
  const id = idRaw ? Number(idRaw) : 0;
  const s = await getSettings();

  try {
    if (entity === "styles" && !data.styleNo) {
      data.styleNo = await nextNumber(table, s.numbering.stylePrefix, s.numbering.padding);
    }
    if (entity === "orders" && !data.orderNo) {
      data.orderNo = await nextNumber(table, s.numbering.orderPrefix, s.numbering.padding);
    }
    if (entity === "tnaTemplates" && data.isDefault === true) {
      await db.update(schema.tnaTemplates).set({ isDefault: false });
    }
    if (entity === "bomItems") {
      const orderId = Number(data.orderId);
      if (orderId && !fd.get("requiredQty")) {
        const [o] = await db.select({ quantity: schema.orders.quantity }).from(schema.orders).where(eq(schema.orders.id, orderId));
        const cons = Number(data.consumption ?? 0);
        const waste = Number(data.wastagePct ?? 0);
        data.requiredQty = Math.round((o?.quantity ?? 0) * cons * (1 + waste / 100) * 100) / 100;
      }
    }

    if (id) {
      await db.update(table).set(data as never).where(eq(columnsOf(table).id, id));
      revalidateAll();
      return { ok: true, id };
    }
    const rows = await db.insert(table).values(data as never).returning();
    const newId = (rows[0] as { id?: number } | undefined)?.id;
    revalidateAll();
    return { ok: true, id: newId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function patchEntity(entity: string, id: number, fd: FormData): Promise<ActionResult> {
  if (!isEntityKey(entity)) return { ok: false, error: "Unknown entity" };
  const { table } = entityRegistry[entity];
  const data = coerceFormData(table, fd);
  try {
    await db.update(table).set(data as never).where(eq(columnsOf(table).id, id));
    revalidateAll();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteEntity(entity: string, id: number): Promise<ActionResult> {
  if (!isEntityKey(entity)) return { ok: false, error: "Unknown entity" };
  const { table } = entityRegistry[entity];
  try {
    await db.delete(table).where(eq(columnsOf(table).id, id));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/*  Orders                                                             */
/* ------------------------------------------------------------------ */
async function generateTna(orderId: number, templateId: number, orderDate: string, shipDate: string) {
  const tasks = await db
    .select()
    .from(schema.tnaTemplateTasks)
    .where(eq(schema.tnaTemplateTasks.templateId, templateId))
    .orderBy(asc(schema.tnaTemplateTasks.sortOrder));
  await db.delete(schema.tnaTasks).where(eq(schema.tnaTasks.orderId, orderId));
  if (!tasks.length) return;
  await db.insert(schema.tnaTasks).values(
    tasks.map((t, i) => {
      const anchor = t.anchor === "order" ? orderDate : shipDate;
      const start = addDays(anchor, t.offsetDays);
      const end = addDays(start, Math.max(0, t.durationDays - 1));
      return {
        orderId,
        name: t.name,
        department: t.department,
        plannedStart: start,
        plannedEnd: end,
        status: "Pending",
        sortOrder: i,
      };
    })
  );
}

export async function createOrder(fd: FormData): Promise<ActionResult> {
  const s = await getSettings();
  const data = coerceFormData(schema.orders, fd);
  let newId = 0;
  try {
    if (!data.orderNo) data.orderNo = await nextNumber(schema.orders, s.numbering.orderPrefix, s.numbering.padding);
    if ((data.smv === null || data.smv === undefined) && data.styleId) {
      const [st] = await db.select({ smv: schema.styles.smv }).from(schema.styles).where(eq(schema.styles.id, Number(data.styleId)));
      data.smv = st?.smv ?? null;
    }
    let templateId = data.tnaTemplateId ? Number(data.tnaTemplateId) : null;
    if (!templateId && s.planning.autoGenerateTna) {
      const [def] = await db.select().from(schema.tnaTemplates).where(eq(schema.tnaTemplates.isDefault, true));
      templateId = def?.id ?? null;
      data.tnaTemplateId = templateId;
    }
    const [row] = await db.insert(schema.orders).values(data as typeof schema.orders.$inferInsert).returning({ id: schema.orders.id });
    newId = row.id;
    if (templateId) {
      await generateTna(newId, templateId, String(data.orderDate), String(data.shipDate));
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateAll();
  redirect(`/orders/${newId}`);
}

export async function updateOrderStatus(orderId: number, fd: FormData): Promise<ActionResult> {
  const status = String(fd.get("status") ?? "");
  if (!status) return { ok: false, error: "Status required" };
  await db.update(schema.orders).set({ status }).where(eq(schema.orders.id, orderId));
  revalidateAll();
  return { ok: true };
}

export async function applyTnaTemplate(orderId: number, fd: FormData): Promise<ActionResult> {
  const templateId = Number(fd.get("templateId"));
  if (!templateId) return { ok: false, error: "Template required" };
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o) return { ok: false, error: "Order not found" };
  await generateTna(orderId, templateId, o.orderDate, o.shipDate);
  await db.update(schema.orders).set({ tnaTemplateId: templateId }).where(eq(schema.orders.id, orderId));
  revalidateAll();
  return { ok: true };
}

export async function addBreakdownRow(orderId: number, fd: FormData): Promise<ActionResult> {
  const colorId = Number(fd.get("colorId")) || null;
  const rows: { sizeId: number; quantity: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("size_") && typeof v === "string" && v.trim() !== "") {
      const qty = Number(v);
      if (qty > 0) rows.push({ sizeId: Number(k.slice(5)), quantity: qty });
    }
  }
  if (!rows.length) return { ok: false, error: "Enter at least one size quantity" };
  try {
    for (const r of rows) {
      const existing = await db
        .select({ id: schema.orderBreakdowns.id })
        .from(schema.orderBreakdowns)
        .where(
          and(
            eq(schema.orderBreakdowns.orderId, orderId),
            colorId ? eq(schema.orderBreakdowns.colorId, colorId) : sql`${schema.orderBreakdowns.colorId} is null`,
            eq(schema.orderBreakdowns.sizeId, r.sizeId)
          )
        );
      if (existing[0]) {
        await db.update(schema.orderBreakdowns).set({ quantity: r.quantity }).where(eq(schema.orderBreakdowns.id, existing[0].id));
      } else {
        await db.insert(schema.orderBreakdowns).values({ orderId, colorId, sizeId: r.sizeId, quantity: r.quantity });
      }
    }
    if (fd.get("__syncQty") === "true") {
      const [sum] = await db
        .select({ total: sql<number>`coalesce(sum(${schema.orderBreakdowns.quantity}),0)` })
        .from(schema.orderBreakdowns)
        .where(eq(schema.orderBreakdowns.orderId, orderId));
      await db.update(schema.orders).set({ quantity: Number(sum.total) }).where(eq(schema.orders.id, orderId));
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/*  TNA                                                                */
/* ------------------------------------------------------------------ */
export async function updateTnaStatus(taskId: number, fd: FormData): Promise<ActionResult> {
  const status = String(fd.get("status") ?? "Pending");
  const [t] = await db.select().from(schema.tnaTasks).where(eq(schema.tnaTasks.id, taskId));
  if (!t) return { ok: false, error: "Task not found" };
  const now = today();
  const patch: Partial<typeof schema.tnaTasks.$inferInsert> = { status };
  if (status === "In Progress") {
    patch.actualStart = t.actualStart ?? now;
    patch.actualEnd = null;
  } else if (status === "Completed") {
    patch.actualStart = t.actualStart ?? now;
    patch.actualEnd = now;
  } else {
    patch.actualStart = null;
    patch.actualEnd = null;
  }
  await db.update(schema.tnaTasks).set(patch).where(eq(schema.tnaTasks.id, taskId));
  revalidateAll();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Planning                                                           */
/* ------------------------------------------------------------------ */
export async function allocatePlan(fd: FormData): Promise<ActionResult> {
  const s = await getSettings();
  const orderId = Number(fd.get("orderId"));
  let lineId = Number(fd.get("lineId"));
  const process = String(fd.get("process") || s.planning.defaultProcess);
  let startDate = String(fd.get("startDate") || today());
  const plannedQty = Number(fd.get("plannedQty"));
  const effRaw = fd.get("efficiency");
  const efficiency = effRaw && String(effRaw).trim() !== "" ? Number(effRaw) : null;
  const dailyRaw = fd.get("dailyTarget");
  const remarks = String(fd.get("remarks") ?? "") || null;

  if (!orderId || !plannedQty || plannedQty <= 0) return { ok: false, error: "Order and quantity are required" };

  const [order] = await db
    .select({ id: schema.orders.id, smv: schema.orders.smv, styleSmv: schema.styles.smv, status: schema.orders.status })
    .from(schema.orders)
    .leftJoin(schema.styles, eq(schema.orders.styleId, schema.styles.id))
    .where(eq(schema.orders.id, orderId));
  if (!order) return { ok: false, error: "Order not found" };
  const smv = order.smv ?? order.styleSmv ?? 0;

  const holidayRows = await db.select().from(schema.holidays);
  const holidaySet = new Set(holidayRows.map((h) => h.date));

  const lines = await db.select().from(schema.productionLines).where(eq(schema.productionLines.isActive, true));

  // Auto line selection: pick the line that becomes free earliest (tie → higher capacity)
  if (!lineId) {
    const allocs = await db.select().from(schema.planAllocations);
    let best: { lineId: number; start: string; cap: number } | null = null;
    for (const l of lines.filter((l) => l.section === process || l.section === "Sewing")) {
      const busyUntil = allocs
        .filter((a) => a.lineId === l.id && a.endDate >= startDate)
        .reduce((m, a) => (a.endDate > m ? a.endDate : m), "");
      const candidate = busyUntil ? addDays(busyUntil, 1) : startDate;
      const cap = lineDailyCapacity(l, smv, s, efficiency);
      if (!best || candidate < best.start || (candidate === best.start && cap > best.cap)) {
        best = { lineId: l.id, start: candidate, cap };
      }
    }
    if (!best) return { ok: false, error: "No active line available" };
    lineId = best.lineId;
    startDate = best.start;
  }

  const line = lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, error: "Line not found" };

  let dailyTarget = dailyRaw && String(dailyRaw).trim() !== "" ? Number(dailyRaw) : 0;
  if (!dailyTarget) dailyTarget = lineDailyCapacity(line, smv, s, efficiency);
  if (!dailyTarget || dailyTarget <= 0) {
    return { ok: false, error: "Cannot compute daily target – set SMV on the style/order or enter a daily target" };
  }
  const days = Math.ceil(plannedQty / dailyTarget);
  const endDate = endDateForWorkingDays(startDate, days, s.planning.workingDays, holidaySet);

  try {
    await db.insert(schema.planAllocations).values({
      orderId,
      lineId,
      process,
      startDate,
      endDate,
      plannedQty,
      dailyTarget,
      efficiency: efficiency ?? line.efficiency,
      status: "Planned",
      remarks,
    });
    if (order.status === "confirmed" && fd.get("__setInProduction") === "true") {
      await db.update(schema.orders).set({ status: "in_production" }).where(eq(schema.orders.id, orderId));
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */
async function putSetting(key: string, value: unknown) {
  await db
    .insert(schema.settings)
    .values({ key, value: value as Record<string, unknown> })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as Record<string, unknown>, updatedAt: new Date() } });
}

export async function saveSettings(section: string, fd: FormData): Promise<ActionResult> {
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const num = (k: string, fallback: number) => {
    const v = str(k);
    return v === "" ? fallback : Number(v);
  };
  try {
    switch (section) {
      case "company":
        await putSetting("company", {
          name: str("name"),
          shortName: str("shortName"),
          address: str("address"),
          phone: str("phone"),
          email: str("email"),
          currency: str("currency") || "USD",
          fiscalYearStart: str("fiscalYearStart") || "01",
          dateFormat: str("dateFormat") || "dmy",
          timezone: isValidTimeZone(str("timezone")) ? str("timezone") : "Asia/Dhaka",
        });
        break;
      case "planning":
        await putSetting("planning", {
          workingHoursPerDay: num("workingHoursPerDay", 8),
          workingDays: fd.getAll("workingDays").map(Number),
          defaultEfficiency: num("defaultEfficiency", 60),
          overtimeHours: num("overtimeHours", 0),
          planningHorizonWeeks: num("planningHorizonWeeks", 8),
          utilizationWarn: num("utilizationWarn", 85),
          utilizationCritical: num("utilizationCritical", 100),
          autoGenerateTna: fd.get("autoGenerateTna") === "on",
          defaultProcess: str("defaultProcess") || "Sewing",
        });
        break;
      case "theme":
        await putSetting("theme", {
          primary: str("primary") || "#0f766e",
          density: str("density") || "comfortable",
          sidebarStyle: str("sidebarStyle") || "dark",
        });
        break;
      case "modules": {
        const mods: Record<string, boolean> = {};
        for (const m of MODULE_LIST) {
          mods[m.key] = m.key === "dashboard" || m.key === "settings" ? true : fd.get(`module_${m.key}`) === "on";
        }
        await putSetting("modules", mods);
        break;
      }
      case "numbering":
        await putSetting("numbering", {
          orderPrefix: str("orderPrefix"),
          stylePrefix: str("stylePrefix"),
          padding: num("padding", 4),
        });
        break;
      case "orderStatuses":
      case "priorities": {
        const keys = fd.getAll("key").map(String);
        const labels = fd.getAll("label").map(String);
        const colorsList = fd.getAll("color").map(String);
        const list = keys
          .map((k, i) => ({
            key: k.trim().toLowerCase().replace(/\s+/g, "_"),
            label: labels[i]?.trim() || k,
            color: colorsList[i] || "#64748b",
          }))
          .filter((x) => x.key);
        await putSetting(section, list);
        break;
      }
      case "lists":
        await putSetting("bomTypes", str("bomTypes").split(",").map((x) => x.trim()).filter(Boolean));
        await putSetting("units", str("units").split(",").map((x) => x.trim()).filter(Boolean));
        await putSetting("shipModes", str("shipModes").split(",").map((x) => x.trim()).filter(Boolean));
        break;
      default:
        return { ok: false, error: "Unknown settings section" };
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/*  Void wrappers for <form action> usage in server components         */
/* ------------------------------------------------------------------ */
export async function updateOrderStatusForm(orderId: number, fd: FormData): Promise<void> {
  await updateOrderStatus(orderId, fd);
}
export async function patchEntityForm(entity: string, id: number, fd: FormData): Promise<void> {
  await patchEntity(entity, id, fd);
}
export async function updateTnaStatusForm(taskId: number, fd: FormData): Promise<void> {
  await updateTnaStatus(taskId, fd);
}
export async function saveEntityForm(entity: string, fd: FormData): Promise<void> {
  await saveEntity(entity, fd);
}

/* ------------------------------------------------------------------ */
/*  Data management                                                    */
/* ------------------------------------------------------------------ */
export async function loadDemoData(): Promise<ActionResult> {
  try {
    await clearDatabase();
    await seedDatabase();
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function clearAllData(): Promise<ActionResult> {
  try {
    await clearDatabase();
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
