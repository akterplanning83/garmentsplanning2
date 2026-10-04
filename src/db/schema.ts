import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Settings (key/value JSON store – fully customizable configuration) */
/* ------------------------------------------------------------------ */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  Factory structure                                                  */
/* ------------------------------------------------------------------ */
export const factories = pgTable("factories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  location: text("location"),
  isActive: boolean("is_active").default(true).notNull(),
});

export const productionLines = pgTable("production_lines", {
  id: serial("id").primaryKey(),
  factoryId: integer("factory_id").references(() => factories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  code: text("code"),
  section: text("section").default("Sewing").notNull(),
  operators: integer("operators").default(30).notNull(),
  helpers: integer("helpers").default(8).notNull(),
  machines: integer("machines").default(30).notNull(),
  workingHours: real("working_hours"),
  efficiency: real("efficiency").default(60).notNull(),
  colorHex: text("color_hex").default("#0f766e"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

/* ------------------------------------------------------------------ */
/*  Business partners                                                  */
/* ------------------------------------------------------------------ */
export const buyers = pgTable("buyers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  country: text("country"),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  paymentTerms: text("payment_terms"),
  leadTimeDays: integer("lead_time_days"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  customData: jsonb("custom_data").$type<Record<string, unknown>>().default({}),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  type: text("type").default("Fabric").notNull(),
  country: text("country"),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  leadTimeDays: integer("lead_time_days"),
  isActive: boolean("is_active").default(true).notNull(),
});

/* ------------------------------------------------------------------ */
/*  Master data                                                        */
/* ------------------------------------------------------------------ */
export const colors = pgTable("colors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hex: text("hex").default("#94a3b8"),
});

export const sizes = pgTable("sizes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const categories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  garmentType: text("garment_type").default("Knit").notNull(),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const processes = pgTable("processes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  name: text("name").notNull(),
});

export const customFields = pgTable("custom_fields", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(), // orders | styles | buyers
  label: text("label").notNull(),
  fieldKey: text("field_key").notNull(),
  type: text("type").default("text").notNull(), // text | number | date | select | checkbox
  options: text("options"), // comma separated for select
  required: boolean("required").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

/* ------------------------------------------------------------------ */
/*  TNA templates                                                      */
/* ------------------------------------------------------------------ */
export const tnaTemplates = pgTable("tna_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
});

export const tnaTemplateTasks = pgTable("tna_template_tasks", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .references(() => tnaTemplates.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  department: text("department"),
  anchor: text("anchor").default("ship").notNull(), // order | ship
  offsetDays: integer("offset_days").default(0).notNull(),
  durationDays: integer("duration_days").default(1).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
export const styles = pgTable("styles", {
  id: serial("id").primaryKey(),
  styleNo: text("style_no").notNull(),
  name: text("name").notNull(),
  buyerId: integer("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  garmentType: text("garment_type").default("Knit"),
  season: text("season"),
  description: text("description"),
  fabricDetails: text("fabric_details"),
  smv: real("smv").default(0).notNull(),
  status: text("status").default("Development").notNull(),
  imageUrl: text("image_url"),
  customData: jsonb("custom_data").$type<Record<string, unknown>>().default({}),
});

export const styleOperations = pgTable("style_operations", {
  id: serial("id").primaryKey(),
  styleId: integer("style_id")
    .references(() => styles.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  machineType: text("machine_type"),
  smv: real("smv").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

/* ------------------------------------------------------------------ */
/*  Orders                                                             */
/* ------------------------------------------------------------------ */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNo: text("order_no").notNull(),
  poNumber: text("po_number"),
  buyerId: integer("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
  styleId: integer("style_id").references(() => styles.id, { onDelete: "set null" }),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  shipDate: date("ship_date", { mode: "string" }).notNull(),
  quantity: integer("quantity").default(0).notNull(),
  unitPrice: real("unit_price").default(0).notNull(),
  currency: text("currency").default("USD").notNull(),
  status: text("status").default("confirmed").notNull(),
  priority: text("priority").default("normal").notNull(),
  destination: text("destination"),
  shipMode: text("ship_mode").default("Sea"),
  smv: real("smv"),
  remarks: text("remarks"),
  tnaTemplateId: integer("tna_template_id"),
  customData: jsonb("custom_data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderBreakdowns = pgTable("order_breakdowns", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  colorId: integer("color_id").references(() => colors.id, { onDelete: "set null" }),
  sizeId: integer("size_id").references(() => sizes.id, { onDelete: "set null" }),
  quantity: integer("quantity").default(0).notNull(),
});

export const bomItems = pgTable("bom_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  itemName: text("item_name").notNull(),
  itemType: text("item_type").default("Fabric").notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  unit: text("unit").default("pcs"),
  consumption: real("consumption").default(0).notNull(),
  wastagePct: real("wastage_pct").default(0).notNull(),
  requiredQty: real("required_qty").default(0).notNull(),
  receivedQty: real("received_qty").default(0).notNull(),
  unitPrice: real("unit_price").default(0).notNull(),
  status: text("status").default("Pending").notNull(),
  etaDate: date("eta_date", { mode: "string" }),
  remarks: text("remarks"),
});

export const tnaTasks = pgTable("tna_tasks", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  department: text("department"),
  plannedStart: date("planned_start", { mode: "string" }).notNull(),
  plannedEnd: date("planned_end", { mode: "string" }).notNull(),
  actualStart: date("actual_start", { mode: "string" }),
  actualEnd: date("actual_end", { mode: "string" }),
  status: text("status").default("Pending").notNull(),
  responsible: text("responsible"),
  remarks: text("remarks"),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const planAllocations = pgTable("plan_allocations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  lineId: integer("line_id")
    .references(() => productionLines.id, { onDelete: "cascade" })
    .notNull(),
  process: text("process").default("Sewing").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  plannedQty: integer("planned_qty").default(0).notNull(),
  dailyTarget: integer("daily_target").default(0).notNull(),
  efficiency: real("efficiency").default(60).notNull(),
  status: text("status").default("Planned").notNull(),
  remarks: text("remarks"),
});

export const dailyProduction = pgTable("daily_production", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  lineId: integer("line_id")
    .references(() => productionLines.id, { onDelete: "cascade" })
    .notNull(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  process: text("process").default("Sewing").notNull(),
  targetQty: integer("target_qty").default(0).notNull(),
  producedQty: integer("produced_qty").default(0).notNull(),
  rejectedQty: integer("rejected_qty").default(0).notNull(),
  manpower: integer("manpower").default(0).notNull(),
  workingHours: real("working_hours").default(8).notNull(),
  remarks: text("remarks"),
});

export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  shipDate: date("ship_date", { mode: "string" }).notNull(),
  quantity: integer("quantity").default(0).notNull(),
  mode: text("mode").default("Sea"),
  invoiceNo: text("invoice_no"),
  remarks: text("remarks"),
});
