// AUTO-GENERATED from src/db/schema.ts via `drizzle-kit generate` and made idempotent.
// Regenerate after schema changes (see README → "Schema management").
// Every statement is safe to re-run: tables use IF NOT EXISTS and foreign keys are
// guarded by a pg_constraint lookup. The whole script runs inside one transaction
// protected by an advisory lock, so concurrent cold starts cannot collide.

export const SCHEMA_TABLES = ["bom_items","buyers","product_categories","colors","custom_fields","daily_production","departments","factories","holidays","order_breakdowns","orders","plan_allocations","processes","production_lines","settings","shipments","sizes","style_operations","styles","suppliers","tna_tasks","tna_template_tasks","tna_templates"] as const;

export const SCHEMA_LOCK_KEY = 727_272_001;

export const SCHEMA_SQL = `
BEGIN;
SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY});
CREATE TABLE IF NOT EXISTS "bom_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"item_name" text NOT NULL,
	"item_type" text DEFAULT 'Fabric' NOT NULL,
	"supplier_id" integer,
	"unit" text DEFAULT 'pcs',
	"consumption" real DEFAULT 0 NOT NULL,
	"wastage_pct" real DEFAULT 0 NOT NULL,
	"required_qty" real DEFAULT 0 NOT NULL,
	"received_qty" real DEFAULT 0 NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"eta_date" date,
	"remarks" text
);
CREATE TABLE IF NOT EXISTS "buyers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"country" text,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"payment_terms" text,
	"lead_time_days" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"garment_type" text DEFAULT 'Knit' NOT NULL
);
CREATE TABLE IF NOT EXISTS "colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hex" text DEFAULT '#94a3b8'
);
CREATE TABLE IF NOT EXISTS "custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"label" text NOT NULL,
	"field_key" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" text,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "daily_production" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"line_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"process" text DEFAULT 'Sewing' NOT NULL,
	"target_qty" integer DEFAULT 0 NOT NULL,
	"produced_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"manpower" integer DEFAULT 0 NOT NULL,
	"working_hours" real DEFAULT 8 NOT NULL,
	"remarks" text
);
CREATE TABLE IF NOT EXISTS "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "factories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"location" text,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL
);
CREATE TABLE IF NOT EXISTS "order_breakdowns" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"color_id" integer,
	"size_id" integer,
	"quantity" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"po_number" text,
	"buyer_id" integer,
	"style_id" integer,
	"order_date" date NOT NULL,
	"ship_date" date NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"destination" text,
	"ship_mode" text DEFAULT 'Sea',
	"smv" real,
	"remarks" text,
	"tna_template_id" integer,
	"custom_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "plan_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"line_id" integer NOT NULL,
	"process" text DEFAULT 'Sewing' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"planned_qty" integer DEFAULT 0 NOT NULL,
	"daily_target" integer DEFAULT 0 NOT NULL,
	"efficiency" real DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'Planned' NOT NULL,
	"remarks" text
);
CREATE TABLE IF NOT EXISTS "processes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS "production_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"factory_id" integer,
	"name" text NOT NULL,
	"code" text,
	"section" text DEFAULT 'Sewing' NOT NULL,
	"operators" integer DEFAULT 30 NOT NULL,
	"helpers" integer DEFAULT 8 NOT NULL,
	"machines" integer DEFAULT 30 NOT NULL,
	"working_hours" real,
	"efficiency" real DEFAULT 60 NOT NULL,
	"color_hex" text DEFAULT '#0f766e',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"ship_date" date NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'Sea',
	"invoice_no" text,
	"remarks" text
);
CREATE TABLE IF NOT EXISTS "sizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "style_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"style_id" integer NOT NULL,
	"name" text NOT NULL,
	"machine_type" text,
	"smv" real DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"style_no" text NOT NULL,
	"name" text NOT NULL,
	"buyer_id" integer,
	"category_id" integer,
	"garment_type" text DEFAULT 'Knit',
	"season" text,
	"description" text,
	"fabric_details" text,
	"smv" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Development' NOT NULL,
	"image_url" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"type" text DEFAULT 'Fabric' NOT NULL,
	"country" text,
	"contact_person" text,
	"email" text,
	"phone" text,
	"lead_time_days" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS "tna_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"planned_start" date NOT NULL,
	"planned_end" date NOT NULL,
	"actual_start" date,
	"actual_end" date,
	"status" text DEFAULT 'Pending' NOT NULL,
	"responsible" text,
	"remarks" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "tna_template_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"anchor" text DEFAULT 'ship' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"duration_days" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "tna_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_items_order_id_orders_id_fk') THEN
    ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_items_supplier_id_suppliers_id_fk') THEN
    ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_production_line_id_production_lines_id_fk') THEN
    ALTER TABLE "daily_production" ADD CONSTRAINT "daily_production_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "production_lines"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_production_order_id_orders_id_fk') THEN
    ALTER TABLE "daily_production" ADD CONSTRAINT "daily_production_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_breakdowns_order_id_orders_id_fk') THEN
    ALTER TABLE "order_breakdowns" ADD CONSTRAINT "order_breakdowns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_breakdowns_color_id_colors_id_fk') THEN
    ALTER TABLE "order_breakdowns" ADD CONSTRAINT "order_breakdowns_color_id_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_breakdowns_size_id_sizes_id_fk') THEN
    ALTER TABLE "order_breakdowns" ADD CONSTRAINT "order_breakdowns_size_id_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_buyer_id_buyers_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_style_id_styles_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_style_id_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_allocations_order_id_orders_id_fk') THEN
    ALTER TABLE "plan_allocations" ADD CONSTRAINT "plan_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_allocations_line_id_production_lines_id_fk') THEN
    ALTER TABLE "plan_allocations" ADD CONSTRAINT "plan_allocations_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "production_lines"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_lines_factory_id_factories_id_fk') THEN
    ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "factories"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipments_order_id_orders_id_fk') THEN
    ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'style_operations_style_id_styles_id_fk') THEN
    ALTER TABLE "style_operations" ADD CONSTRAINT "style_operations_style_id_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'styles_buyer_id_buyers_id_fk') THEN
    ALTER TABLE "styles" ADD CONSTRAINT "styles_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'styles_category_id_product_categories_id_fk') THEN
    ALTER TABLE "styles" ADD CONSTRAINT "styles_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tna_tasks_order_id_orders_id_fk') THEN
    ALTER TABLE "tna_tasks" ADD CONSTRAINT "tna_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tna_template_tasks_template_id_tna_templates_id_fk') THEN
    ALTER TABLE "tna_template_tasks" ADD CONSTRAINT "tna_template_tasks_template_id_tna_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "tna_templates"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
COMMIT;
`;
