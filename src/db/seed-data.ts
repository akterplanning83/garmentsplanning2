import { sql } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { addDays, today, endDateForWorkingDays, isWorkingDay } from "../lib/dates";

const TABLES = [
  "daily_production",
  "shipments",
  "plan_allocations",
  "tna_tasks",
  "bom_items",
  "order_breakdowns",
  "orders",
  "style_operations",
  "styles",
  "tna_template_tasks",
  "tna_templates",
  "custom_fields",
  "holidays",
  "processes",
  "departments",
  "product_categories",
  "sizes",
  "colors",
  "suppliers",
  "buyers",
  "production_lines",
  "factories",
  "settings",
];

export async function clearDatabase() {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));
}

function rnd(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

export async function seedDatabase() {
  const T = today();
  const rand = rnd(42);
  const workingDays = [0, 1, 2, 3, 4, 6];

  /* factories & lines */
  const [f1, f2] = await db
    .insert(schema.factories)
    .values([
      { name: "Unit-1 Savar", code: "U1", location: "DEPZ, Savar" },
      { name: "Unit-2 Gazipur", code: "U2", location: "Konabari, Gazipur" },
    ])
    .returning();

  const palette = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#dc2626", "#0891b2", "#4f46e5", "#ca8a04"];
  const lineRows: (typeof schema.productionLines.$inferInsert)[] = [];
  for (let i = 1; i <= 6; i++) {
    lineRows.push({
      factoryId: f1.id,
      name: `Line ${i}`,
      code: `U1-L${i}`,
      section: "Sewing",
      operators: 28 + (i % 3) * 4,
      helpers: 8,
      machines: 30 + (i % 3) * 4,
      efficiency: 55 + (i % 4) * 5,
      colorHex: palette[i - 1],
      sortOrder: i,
    });
  }
  for (let i = 7; i <= 10; i++) {
    lineRows.push({
      factoryId: f2.id,
      name: `Line ${i}`,
      code: `U2-L${i}`,
      section: "Sewing",
      operators: 36,
      helpers: 10,
      machines: 38,
      efficiency: 62,
      colorHex: palette[i - 1],
      sortOrder: i,
    });
  }
  lineRows.push(
    { factoryId: f1.id, name: "Cutting-1", code: "U1-CUT", section: "Cutting", operators: 20, helpers: 10, machines: 6, efficiency: 70, colorHex: "#64748b", sortOrder: 20 },
    { factoryId: f1.id, name: "Finishing-1", code: "U1-FIN", section: "Finishing", operators: 40, helpers: 15, machines: 10, efficiency: 65, colorHex: "#475569", sortOrder: 21 }
  );
  const lines = await db.insert(schema.productionLines).values(lineRows).returning();
  const sewingLines = lines.filter((l) => l.section === "Sewing");

  /* buyers & suppliers */
  const buyers = await db
    .insert(schema.buyers)
    .values([
      { name: "H&M", code: "HM", country: "Sweden", contactPerson: "Anna Lindqvist", email: "anna@hm.com", paymentTerms: "LC 90 days", leadTimeDays: 90, customData: { complianceAudit: "2026-03-15" } },
      { name: "Inditex (Zara)", code: "ZARA", country: "Spain", contactPerson: "Carlos Ruiz", email: "cruiz@inditex.com", paymentTerms: "TT 60 days", leadTimeDays: 75 },
      { name: "Primark", code: "PRM", country: "Ireland", contactPerson: "Sean Murphy", email: "sean@primark.ie", paymentTerms: "LC at sight", leadTimeDays: 100 },
      { name: "C&A", code: "CA", country: "Germany", contactPerson: "Lena Hoffmann", email: "lena@c-and-a.com", paymentTerms: "LC 60 days", leadTimeDays: 95 },
      { name: "Target", code: "TGT", country: "USA", contactPerson: "Mike Ross", email: "mike@target.com", paymentTerms: "LC 120 days", leadTimeDays: 110 },
      { name: "Uniqlo", code: "UNQ", country: "Japan", contactPerson: "Kenji Sato", email: "sato@uniqlo.co.jp", paymentTerms: "TT 30 days", leadTimeDays: 85 },
      { name: "Decathlon", code: "DEC", country: "France", contactPerson: "Julie Martin", email: "julie@decathlon.com", paymentTerms: "LC 90 days", leadTimeDays: 90 },
    ])
    .returning();

  const suppliers = await db
    .insert(schema.suppliers)
    .values([
      { name: "Square Fabrics Ltd.", code: "SQF", type: "Fabric", country: "Bangladesh", leadTimeDays: 25 },
      { name: "Pacific Denim Mills", code: "PDM", type: "Fabric", country: "Bangladesh", leadTimeDays: 30 },
      { name: "Coats Bangladesh", code: "COATS", type: "Thread", country: "Bangladesh", leadTimeDays: 7 },
      { name: "YKK Bangladesh", code: "YKK", type: "Trim", country: "Bangladesh", leadTimeDays: 15 },
      { name: "Avery Dennison", code: "AVERY", type: "Label", country: "Bangladesh", leadTimeDays: 10 },
      { name: "Shanghai Textile Import", code: "STI", type: "Fabric", country: "China", leadTimeDays: 40 },
      { name: "Dhaka Poly & Carton", code: "DPC", type: "Packaging", country: "Bangladesh", leadTimeDays: 7 },
    ])
    .returning();

  /* master data */
  const colors = await db
    .insert(schema.colors)
    .values([
      { name: "Black", hex: "#111827" },
      { name: "White", hex: "#f8fafc" },
      { name: "Navy", hex: "#1e3a8a" },
      { name: "Heather Grey", hex: "#9ca3af" },
      { name: "Red", hex: "#dc2626" },
      { name: "Olive", hex: "#4d7c0f" },
      { name: "Royal Blue", hex: "#2563eb" },
      { name: "Dusty Pink", hex: "#f472b6" },
      { name: "Beige", hex: "#d6c7a1" },
      { name: "Maroon", hex: "#7f1d1d" },
    ])
    .returning();

  const sizes = await db
    .insert(schema.sizes)
    .values([
      { name: "XS", sortOrder: 1 },
      { name: "S", sortOrder: 2 },
      { name: "M", sortOrder: 3 },
      { name: "L", sortOrder: 4 },
      { name: "XL", sortOrder: 5 },
      { name: "XXL", sortOrder: 6 },
    ])
    .returning();

  const categories = await db
    .insert(schema.categories)
    .values([
      { name: "T-Shirt", garmentType: "Knit" },
      { name: "Polo Shirt", garmentType: "Knit" },
      { name: "Hoodie", garmentType: "Knit" },
      { name: "Leggings", garmentType: "Knit" },
      { name: "Denim Pant", garmentType: "Woven" },
      { name: "Casual Shirt", garmentType: "Woven" },
      { name: "Jacket", garmentType: "Woven" },
      { name: "Sweater", garmentType: "Sweater" },
    ])
    .returning();

  await db.insert(schema.departments).values(
    ["Merchandising", "Sampling", "Fabric", "Trims", "Planning", "Cutting", "Printing", "Sewing", "Washing", "Finishing", "Quality", "Commercial"].map((n, i) => ({ name: n, sortOrder: i }))
  );
  await db.insert(schema.processes).values(
    ["Cutting", "Printing", "Embroidery", "Sewing", "Washing", "Finishing", "Packing"].map((n, i) => ({ name: n, sortOrder: i }))
  );

  await db.insert(schema.holidays).values([
    { date: addDays(T, 12), name: "Factory Maintenance Day" },
    { date: addDays(T, 33), name: "National Holiday" },
    { date: addDays(T, 34), name: "National Holiday" },
  ]);

  await db.insert(schema.customFields).values([
    { entity: "orders", label: "Merchandiser", fieldKey: "merchandiser", type: "text", sortOrder: 1 },
    { entity: "orders", label: "Buyer Season", fieldKey: "season", type: "select", options: "SS26,AW26,SS27,AW27", sortOrder: 2 },
    { entity: "orders", label: "Inspection Type", fieldKey: "inspection", type: "select", options: "Buyer QC,Third Party,Self Inspection", sortOrder: 3 },
    { entity: "styles", label: "Wash Type", fieldKey: "washType", type: "text", sortOrder: 1 },
    { entity: "styles", label: "Print / Embroidery", fieldKey: "hasPrint", type: "checkbox", sortOrder: 2 },
    { entity: "buyers", label: "Compliance Audit Date", fieldKey: "complianceAudit", type: "date", sortOrder: 1 },
  ]);

  /* TNA templates */
  const [tplKnit, tplWoven] = await db
    .insert(schema.tnaTemplates)
    .values([
      { name: "Standard Knit (90 days)", description: "Default critical path for knit basics", isDefault: true },
      { name: "Woven with Wash (120 days)", description: "Woven bottoms / shirts with washing", isDefault: false },
    ])
    .returning();

  const knitTasks: [string, string, "order" | "ship", number, number][] = [
    ["PO receive & order confirmation", "Merchandising", "order", 0, 1],
    ["Fabric booking", "Fabric", "order", 2, 2],
    ["Lab dip submission & approval", "Merchandising", "order", 4, 8],
    ["Trims & accessories booking", "Trims", "order", 6, 2],
    ["Fit sample submission", "Sampling", "order", 10, 5],
    ["Fabric in-house", "Fabric", "ship", -45, 5],
    ["Trims in-house", "Trims", "ship", -36, 5],
    ["PP sample approval", "Sampling", "ship", -35, 5],
    ["PP meeting", "Planning", "ship", -28, 1],
    ["Cutting", "Cutting", "ship", -27, 10],
    ["Print / Embroidery", "Printing", "ship", -26, 8],
    ["Sewing", "Sewing", "ship", -24, 14],
    ["Finishing & packing", "Finishing", "ship", -10, 7],
    ["Final inspection", "Quality", "ship", -4, 1],
    ["Ex-factory / handover", "Commercial", "ship", 0, 1],
  ];
  const wovenTasks: [string, string, "order" | "ship", number, number][] = [
    ["PO receive & order confirmation", "Merchandising", "order", 0, 1],
    ["Fabric booking (mill)", "Fabric", "order", 2, 3],
    ["Lab dip / shade band approval", "Merchandising", "order", 5, 10],
    ["Trims & accessories booking", "Trims", "order", 8, 3],
    ["Fit sample submission", "Sampling", "order", 12, 6],
    ["Wash standard approval", "Washing", "order", 20, 10],
    ["Fabric in-house", "Fabric", "ship", -60, 7],
    ["Trims in-house", "Trims", "ship", -45, 5],
    ["PP sample approval", "Sampling", "ship", -42, 5],
    ["PP meeting", "Planning", "ship", -36, 1],
    ["Cutting", "Cutting", "ship", -35, 12],
    ["Sewing", "Sewing", "ship", -32, 18],
    ["Washing", "Washing", "ship", -16, 6],
    ["Finishing & packing", "Finishing", "ship", -11, 8],
    ["Final inspection", "Quality", "ship", -4, 1],
    ["Ex-factory / handover", "Commercial", "ship", 0, 1],
  ];
  await db.insert(schema.tnaTemplateTasks).values([
    ...knitTasks.map(([name, department, anchor, offsetDays, durationDays], i) => ({ templateId: tplKnit.id, name, department, anchor, offsetDays, durationDays, sortOrder: i })),
    ...wovenTasks.map(([name, department, anchor, offsetDays, durationDays], i) => ({ templateId: tplWoven.id, name, department, anchor, offsetDays, durationDays, sortOrder: i })),
  ]);

  /* styles */
  const cat = (n: string) => categories.find((c) => c.name === n)!;
  const byr = (code: string) => buyers.find((b) => b.code === code)!;
  const styleDefs = [
    { styleNo: "ST-0001", name: "Basic Crew Neck Tee", buyer: "HM", cat: "T-Shirt", smv: 8.5, season: "SS26", fabric: "100% Cotton S/J 160 GSM", status: "Running" },
    { styleNo: "ST-0002", name: "Pique Polo w/ Rib Collar", buyer: "ZARA", cat: "Polo Shirt", smv: 14.2, season: "SS26", fabric: "Cotton Pique 220 GSM", status: "Running" },
    { styleNo: "ST-0003", name: "Pullover Hoodie Fleece", buyer: "PRM", cat: "Hoodie", smv: 22.8, season: "AW26", fabric: "CVC Fleece 280 GSM", status: "Running" },
    { styleNo: "ST-0004", name: "5-Pocket Slim Denim", buyer: "CA", cat: "Denim Pant", smv: 28.5, season: "AW26", fabric: "12 oz Stretch Denim", status: "Approved" },
    { styleNo: "ST-0005", name: "Oxford Casual Shirt L/S", buyer: "TGT", cat: "Casual Shirt", smv: 24.0, season: "SS26", fabric: "Cotton Oxford 140 GSM", status: "Running" },
    { styleNo: "ST-0006", name: "Padded Bomber Jacket", buyer: "UNQ", cat: "Jacket", smv: 46.5, season: "AW26", fabric: "Nylon Taffeta + Padding", status: "Development" },
    { styleNo: "ST-0007", name: "High-Waist Sports Legging", buyer: "DEC", cat: "Leggings", smv: 11.3, season: "SS26", fabric: "Poly-Spandex 260 GSM", status: "Running" },
    { styleNo: "ST-0008", name: "Crew Neck Lambswool Sweater", buyer: "HM", cat: "Sweater", smv: 32.0, season: "AW26", fabric: "12GG Lambswool", status: "Approved" },
    { styleNo: "ST-0009", name: "Graphic Print Tee Oversized", buyer: "HM", cat: "T-Shirt", smv: 9.4, season: "SS26", fabric: "Cotton S/J 180 GSM", status: "Running" },
    { styleNo: "ST-0010", name: "Zip-Through Hoodie", buyer: "TGT", cat: "Hoodie", smv: 26.1, season: "AW26", fabric: "Cotton Fleece 300 GSM", status: "Approved" },
  ];
  const styles = await db
    .insert(schema.styles)
    .values(
      styleDefs.map((s) => ({
        styleNo: s.styleNo,
        name: s.name,
        buyerId: byr(s.buyer).id,
        categoryId: cat(s.cat).id,
        garmentType: cat(s.cat).garmentType,
        season: s.season,
        fabricDetails: s.fabric,
        smv: s.smv,
        status: s.status,
        customData: { washType: s.cat === "Denim Pant" ? "Enzyme + Stone" : "Garment Wash", hasPrint: s.name.includes("Print") ? "true" : "false" },
      }))
    )
    .returning();

  await db.insert(schema.styleOperations).values([
    { styleId: styles[0].id, name: "Shoulder join", machineType: "Overlock 4T", smv: 0.55, sortOrder: 1 },
    { styleId: styles[0].id, name: "Neck rib attach", machineType: "Overlock 4T", smv: 0.8, sortOrder: 2 },
    { styleId: styles[0].id, name: "Neck top stitch", machineType: "Flatlock", smv: 0.7, sortOrder: 3 },
    { styleId: styles[0].id, name: "Sleeve attach", machineType: "Overlock 4T", smv: 1.1, sortOrder: 4 },
    { styleId: styles[0].id, name: "Side seam", machineType: "Overlock 4T", smv: 1.3, sortOrder: 5 },
    { styleId: styles[0].id, name: "Sleeve hem", machineType: "Flatlock", smv: 0.9, sortOrder: 6 },
    { styleId: styles[0].id, name: "Bottom hem", machineType: "Flatlock", smv: 1.0, sortOrder: 7 },
    { styleId: styles[0].id, name: "Label attach", machineType: "Plain", smv: 0.65, sortOrder: 8 },
    { styleId: styles[0].id, name: "Thread trimming & inspection", machineType: "Manual", smv: 1.5, sortOrder: 9 },
    { styleId: styles[1].id, name: "Collar make", machineType: "Plain", smv: 1.8, sortOrder: 1 },
    { styleId: styles[1].id, name: "Placket attach", machineType: "Plain", smv: 2.6, sortOrder: 2 },
    { styleId: styles[1].id, name: "Shoulder join", machineType: "Overlock 4T", smv: 0.6, sortOrder: 3 },
    { styleId: styles[1].id, name: "Collar attach", machineType: "Plain", smv: 1.9, sortOrder: 4 },
    { styleId: styles[1].id, name: "Sleeve attach", machineType: "Overlock 4T", smv: 1.2, sortOrder: 5 },
    { styleId: styles[1].id, name: "Side seam w/ slit", machineType: "Overlock 4T", smv: 1.7, sortOrder: 6 },
    { styleId: styles[1].id, name: "Button hole & attach", machineType: "BH/BA", smv: 1.4, sortOrder: 7 },
    { styleId: styles[1].id, name: "Bottom hem", machineType: "Flatlock", smv: 1.1, sortOrder: 8 },
    { styleId: styles[1].id, name: "Final inspection", machineType: "Manual", smv: 1.8, sortOrder: 9 },
  ]);

  /* orders */
  type OrderDef = { style: number; po: string; orderOffset: number; shipOffset: number; qty: number; price: number; status: string; priority: string; dest: string; mode: string; tpl: number };
  const orderDefs: OrderDef[] = [
    { style: 0, po: "HM-4471029", orderOffset: -70, shipOffset: -12, qty: 42000, price: 2.35, status: "shipped", priority: "normal", dest: "Hamburg", mode: "Sea", tpl: tplKnit.id },
    { style: 1, po: "ZR-88213", orderOffset: -60, shipOffset: 8, qty: 18000, price: 4.9, status: "in_production", priority: "high", dest: "Zaragoza", mode: "Sea", tpl: tplKnit.id },
    { style: 2, po: "PRM-20261-A", orderOffset: -55, shipOffset: 14, qty: 30000, price: 7.25, status: "in_production", priority: "normal", dest: "Dublin", mode: "Sea", tpl: tplKnit.id },
    { style: 0, po: "HM-4471104", orderOffset: -50, shipOffset: 20, qty: 60000, price: 2.28, status: "in_production", priority: "urgent", dest: "Rotterdam", mode: "Sea", tpl: tplKnit.id },
    { style: 4, po: "TGT-77120", orderOffset: -48, shipOffset: 26, qty: 24000, price: 8.4, status: "in_production", priority: "normal", dest: "Los Angeles", mode: "Sea", tpl: tplWoven.id },
    { style: 6, po: "DEC-55901", orderOffset: -40, shipOffset: 30, qty: 36000, price: 5.1, status: "in_production", priority: "high", dest: "Lille", mode: "Sea", tpl: tplKnit.id },
    { style: 8, po: "HM-4471230", orderOffset: -35, shipOffset: 38, qty: 25000, price: 2.95, status: "confirmed", priority: "normal", dest: "Hamburg", mode: "Sea", tpl: tplKnit.id },
    { style: 3, po: "CA-30981", orderOffset: -30, shipOffset: 52, qty: 15000, price: 11.8, status: "confirmed", priority: "normal", dest: "Düsseldorf", mode: "Sea", tpl: tplWoven.id },
    { style: 9, po: "TGT-77245", orderOffset: -25, shipOffset: 58, qty: 20000, price: 9.6, status: "confirmed", priority: "low", dest: "Chicago", mode: "Sea", tpl: tplKnit.id },
    { style: 1, po: "ZR-88450", orderOffset: -20, shipOffset: 45, qty: 22000, price: 4.75, status: "confirmed", priority: "high", dest: "Zaragoza", mode: "Air", tpl: tplKnit.id },
    { style: 7, po: "HM-4471302", orderOffset: -15, shipOffset: 70, qty: 12000, price: 14.5, status: "confirmed", priority: "normal", dest: "Stockholm", mode: "Sea", tpl: tplWoven.id },
    { style: 5, po: "UNQ-1190", orderOffset: -10, shipOffset: 85, qty: 8000, price: 19.9, status: "inquiry", priority: "normal", dest: "Tokyo", mode: "Sea", tpl: tplWoven.id },
    { style: 2, po: "PRM-20261-B", orderOffset: -8, shipOffset: 64, qty: 28000, price: 7.1, status: "confirmed", priority: "normal", dest: "Dublin", mode: "Sea", tpl: tplKnit.id },
    { style: 6, po: "DEC-56020", orderOffset: -75, shipOffset: -20, qty: 20000, price: 5.0, status: "cancelled", priority: "low", dest: "Lille", mode: "Sea", tpl: tplKnit.id },
  ];

  const merchandisers = ["Rafiq Ahmed", "Sadia Islam", "Tanvir Hasan", "Nusrat Jahan"];
  const orderRows = orderDefs.map((o, i) => {
    const st = styles[o.style];
    return {
      orderNo: `ORD-${String(i + 1).padStart(4, "0")}`,
      poNumber: o.po,
      buyerId: st.buyerId,
      styleId: st.id,
      orderDate: addDays(T, o.orderOffset),
      shipDate: addDays(T, o.shipOffset),
      quantity: o.qty,
      unitPrice: o.price,
      currency: "USD",
      status: o.status,
      priority: o.priority,
      destination: o.dest,
      shipMode: o.mode,
      smv: st.smv,
      tnaTemplateId: o.tpl,
      customData: { merchandiser: merchandisers[i % merchandisers.length], season: st.season, inspection: i % 3 === 0 ? "Third Party" : "Buyer QC" },
    };
  });
  const orders = await db.insert(schema.orders).values(orderRows).returning();

  /* breakdowns, BOM, TNA */
  const sizeDist = [0.08, 0.2, 0.3, 0.25, 0.12, 0.05];
  const breakdownRows: (typeof schema.orderBreakdowns.$inferInsert)[] = [];
  const bomRows: (typeof schema.bomItems.$inferInsert)[] = [];
  const tnaRows: (typeof schema.tnaTasks.$inferInsert)[] = [];
  const tplTasks = await db.select().from(schema.tnaTemplateTasks);

  orders.forEach((o, idx) => {
    const def = orderDefs[idx];
    const nColors = 2 + (idx % 3);
    const orderColors = Array.from({ length: nColors }, (_, k) => colors[(idx * 3 + k) % colors.length]);
    const perColor = Math.floor(o.quantity / nColors);
    orderColors.forEach((c) => {
      sizes.forEach((sz, si) => {
        breakdownRows.push({ orderId: o.id, colorId: c.id, sizeId: sz.id, quantity: Math.round((perColor * sizeDist[si]) / 10) * 10 });
      });
    });

    const st = styles[def.style];
    const isWoven = st.garmentType === "Woven";
    const fabricSup = isWoven ? suppliers[1] : suppliers[0];
    const cons = isWoven ? 1.35 : 0.28;
    const fabricStatus = def.status === "shipped" || def.status === "in_production" ? "In-house" : def.status === "confirmed" ? "Booked" : "Pending";
    const items: [string, string, typeof suppliers[number], string, number, number, number, string][] = [
      [st.fabricDetails ?? "Body fabric", "Fabric", fabricSup, isWoven ? "yds" : "kg", cons, 3, isWoven ? 2.1 : 6.8, fabricStatus],
      ["Sewing thread 40/2", "Thread", suppliers[2], "cone", 0.012, 2, 1.15, fabricStatus],
      ["Main label woven", "Label", suppliers[4], "pcs", 1, 2, 0.03, fabricStatus === "In-house" ? "In-house" : "Booked"],
      ["Care label printed", "Label", suppliers[4], "pcs", 1, 2, 0.015, fabricStatus === "In-house" ? "In-house" : "Booked"],
      ["Hangtag + seal", "Accessory", suppliers[3], "set", 1, 2, 0.06, fabricStatus === "In-house" ? "In-house" : "Pending"],
      ["Polybag LDPE", "Packaging", suppliers[6], "pcs", 1, 1, 0.02, def.status === "shipped" ? "In-house" : "Pending"],
      ["Export carton 5-ply", "Packaging", suppliers[6], "pcs", 1 / 24, 1, 0.9, def.status === "shipped" ? "In-house" : "Pending"],
    ];
    if (isWoven) items.push(["Metal zipper YKK #4", "Trim", suppliers[3], "pcs", 1, 2, 0.18, fabricStatus]);
    if (isWoven) items.push(["Shank button 17L", "Trim", suppliers[3], "pcs", 1, 3, 0.05, fabricStatus]);
    items.forEach(([itemName, itemType, sup, unit, consumption, wastagePct, unitPrice, status]) => {
      const required = Math.round(o.quantity * consumption * (1 + wastagePct / 100) * 100) / 100;
      bomRows.push({
        orderId: o.id,
        itemName,
        itemType,
        supplierId: sup.id,
        unit,
        consumption,
        wastagePct,
        requiredQty: required,
        receivedQty: status === "In-house" ? required : status === "Partial" ? required / 2 : 0,
        unitPrice,
        status,
        etaDate: addDays(o.shipDate, isWoven ? -55 : -40),
      });
    });

    const tasks = tplTasks.filter((t) => t.templateId === def.tpl).sort((a, b) => a.sortOrder - b.sortOrder);
    tasks.forEach((t, i) => {
      const anchor = t.anchor === "order" ? o.orderDate : o.shipDate;
      const start = addDays(anchor, t.offsetDays);
      const end = addDays(start, Math.max(0, t.durationDays - 1));
      let status = "Pending";
      let actualStart: string | null = null;
      let actualEnd: string | null = null;
      if (def.status === "cancelled") {
        status = "Pending";
      } else if (end < T) {
        // mostly completed, a few delayed ones for realism
        const late = rand() < 0.18 && def.status !== "shipped";
        if (!late) {
          status = "Completed";
          actualStart = start;
          actualEnd = addDays(end, rand() < 0.3 ? 1 : 0);
        } else if (rand() < 0.5) {
          status = "In Progress";
          actualStart = start;
        }
      } else if (start <= T) {
        status = rand() < 0.7 ? "In Progress" : "Pending";
        if (status === "In Progress") actualStart = start;
      }
      tnaRows.push({ orderId: o.id, name: t.name, department: t.department, plannedStart: start, plannedEnd: end, actualStart, actualEnd, status, responsible: merchandisers[(idx + i) % merchandisers.length], sortOrder: i });
    });
  });
  await db.insert(schema.orderBreakdowns).values(breakdownRows);
  await db.insert(schema.bomItems).values(bomRows);
  await db.insert(schema.tnaTasks).values(tnaRows);

  /* plan allocations */
  const holidaySet = new Set<string>();
  const allocRows: (typeof schema.planAllocations.$inferInsert)[] = [];
  const capacity = (line: typeof sewingLines[number], smv: number, eff?: number) => Math.floor((line.operators * 8 * 60 * ((eff ?? line.efficiency) / 100)) / smv);

  const planFor = (orderIdx: number, lineIdxs: number[], startOffset: number, status: string) => {
    const o = orders[orderIdx];
    const smv = o.smv ?? 10;
    const share = Math.floor(o.quantity / lineIdxs.length);
    lineIdxs.forEach((li) => {
      const line = sewingLines[li];
      const daily = capacity(line, smv);
      const start = addDays(T, startOffset);
      const end = endDateForWorkingDays(start, Math.ceil(share / daily), workingDays, holidaySet);
      allocRows.push({ orderId: o.id, lineId: line.id, process: "Sewing", startDate: start, endDate: end, plannedQty: share, dailyTarget: daily, efficiency: line.efficiency, status });
    });
  };
  planFor(0, [0, 1], -45, "Completed");
  planFor(1, [2], -14, "Running");
  planFor(2, [3, 4], -10, "Running");
  planFor(3, [0, 1, 5], -6, "Running");
  planFor(4, [6, 7], -8, "Running");
  planFor(5, [8, 9], -3, "Running");
  planFor(6, [2], 9, "Planned");
  planFor(9, [3, 4], 16, "Planned");
  planFor(7, [6], 20, "Planned");
  planFor(8, [7, 8], 24, "Planned");
  planFor(12, [0, 1], 30, "Planned");
  const allocs = await db.insert(schema.planAllocations).values(allocRows).returning();

  /* daily production for running allocations */
  const prodRows: (typeof schema.dailyProduction.$inferInsert)[] = [];
  for (const a of allocs) {
    if (a.status === "Planned") continue;
    const line = lines.find((l) => l.id === a.lineId)!;
    let d = a.startDate;
    const lastDay = a.endDate < addDays(T, -1) ? a.endDate : addDays(T, -1);
    while (d <= lastDay) {
      if (isWorkingDay(d, workingDays, holidaySet)) {
        const factor = 0.82 + rand() * 0.3;
        const hours = rand() < 0.3 ? 10 : 8;
        const produced = Math.round(a.dailyTarget * factor * (hours / 8));
        prodRows.push({
          date: d,
          lineId: a.lineId,
          orderId: a.orderId,
          process: "Sewing",
          targetQty: Math.round(a.dailyTarget * (hours / 8)),
          producedQty: produced,
          rejectedQty: Math.round(produced * (0.01 + rand() * 0.02)),
          manpower: line.operators,
          workingHours: hours,
        });
      }
      d = addDays(d, 1);
    }
  }
  if (prodRows.length) await db.insert(schema.dailyProduction).values(prodRows);

  /* shipments */
  await db.insert(schema.shipments).values([
    { orderId: orders[0].id, shipDate: orders[0].shipDate, quantity: 42000, mode: "Sea", invoiceNo: "INV-26-0091", remarks: "Shipped complete" },
  ]);
}
