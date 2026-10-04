import * as schema from "@/db/schema";
import type { PgTable } from "drizzle-orm/pg-core";

export type EntityKey =
  | "buyers"
  | "suppliers"
  | "styles"
  | "styleOperations"
  | "factories"
  | "productionLines"
  | "colors"
  | "sizes"
  | "categories"
  | "departments"
  | "processes"
  | "holidays"
  | "customFields"
  | "tnaTemplates"
  | "tnaTemplateTasks"
  | "orders"
  | "orderBreakdowns"
  | "bomItems"
  | "tnaTasks"
  | "planAllocations"
  | "dailyProduction"
  | "shipments";

export const entityRegistry: Record<EntityKey, { table: PgTable; label: string }> = {
  buyers: { table: schema.buyers, label: "Buyer" },
  suppliers: { table: schema.suppliers, label: "Supplier" },
  styles: { table: schema.styles, label: "Style" },
  styleOperations: { table: schema.styleOperations, label: "Operation" },
  factories: { table: schema.factories, label: "Factory" },
  productionLines: { table: schema.productionLines, label: "Production Line" },
  colors: { table: schema.colors, label: "Color" },
  sizes: { table: schema.sizes, label: "Size" },
  categories: { table: schema.categories, label: "Category" },
  departments: { table: schema.departments, label: "Department" },
  processes: { table: schema.processes, label: "Process" },
  holidays: { table: schema.holidays, label: "Holiday" },
  customFields: { table: schema.customFields, label: "Custom Field" },
  tnaTemplates: { table: schema.tnaTemplates, label: "TNA Template" },
  tnaTemplateTasks: { table: schema.tnaTemplateTasks, label: "Template Task" },
  orders: { table: schema.orders, label: "Order" },
  orderBreakdowns: { table: schema.orderBreakdowns, label: "Breakdown" },
  bomItems: { table: schema.bomItems, label: "BOM Item" },
  tnaTasks: { table: schema.tnaTasks, label: "TNA Task" },
  planAllocations: { table: schema.planAllocations, label: "Plan Allocation" },
  dailyProduction: { table: schema.dailyProduction, label: "Production Entry" },
  shipments: { table: schema.shipments, label: "Shipment" },
};

export function isEntityKey(k: string): k is EntityKey {
  return k in entityRegistry;
}

/** Field definition used by the generic CrudModal client component */
export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "color" | "hidden";
  options?: { value: string; label: string }[];
  required?: boolean;
  step?: string;
  min?: number;
  placeholder?: string;
  help?: string;
  span?: 1 | 2;
  defaultValue?: string | number | boolean | null;
};

export type ActionResult = { ok: boolean; error?: string; id?: number };
