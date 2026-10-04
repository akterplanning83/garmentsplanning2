import { db } from "@/db";
import { settings } from "@/db/schema";
import { ensureSchema } from "@/db/bootstrap";
import { setActiveTimeZone } from "./dates";

export type StatusOption = { key: string; label: string; color: string };

export type AppSettings = {
  company: {
    name: string;
    shortName: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
    fiscalYearStart: string;
    dateFormat: "dmy" | "mdy" | "ymd";
    timezone: string;
  };
  planning: {
    workingHoursPerDay: number;
    workingDays: number[]; // 0=Sun ... 6=Sat
    defaultEfficiency: number;
    overtimeHours: number;
    planningHorizonWeeks: number;
    utilizationWarn: number;
    utilizationCritical: number;
    autoGenerateTna: boolean;
    defaultProcess: string;
  };
  theme: {
    primary: string;
    density: "comfortable" | "compact";
    sidebarStyle: "dark" | "light";
  };
  modules: Record<string, boolean>;
  numbering: {
    orderPrefix: string;
    stylePrefix: string;
    padding: number;
  };
  orderStatuses: StatusOption[];
  priorities: StatusOption[];
  bomTypes: string[];
  units: string[];
  shipModes: string[];
};

export const MODULE_LIST: { key: string; label: string; href: string; icon: string; group: string }[] = [
  { key: "dashboard", label: "Dashboard", href: "/", icon: "◫", group: "Overview" },
  { key: "orders", label: "Orders", href: "/orders", icon: "▤", group: "Merchandising" },
  { key: "buyers", label: "Buyers", href: "/buyers", icon: "◉", group: "Merchandising" },
  { key: "styles", label: "Styles", href: "/styles", icon: "✂", group: "Merchandising" },
  { key: "suppliers", label: "Suppliers", href: "/suppliers", icon: "⬡", group: "Merchandising" },
  { key: "planning", label: "Planning Board", href: "/planning", icon: "▦", group: "Planning" },
  { key: "capacity", label: "Capacity", href: "/capacity", icon: "◔", group: "Planning" },
  { key: "tna", label: "Time & Action", href: "/tna", icon: "◷", group: "Planning" },
  { key: "materials", label: "Materials / BOM", href: "/materials", icon: "▣", group: "Supply Chain" },
  { key: "production", label: "Daily Production", href: "/production", icon: "▲", group: "Production" },
  { key: "shipments", label: "Shipments", href: "/shipments", icon: "➤", group: "Production" },
  { key: "reports", label: "Reports", href: "/reports", icon: "≡", group: "Analytics" },
  { key: "settings", label: "Settings", href: "/settings", icon: "⚙", group: "System" },
];

export const defaultSettings: AppSettings = {
  company: {
    name: "Apex Apparels Ltd.",
    shortName: "APEX",
    address: "Plot 12, DEPZ, Savar, Dhaka",
    phone: "+880 1700 000000",
    email: "planning@apexapparels.com",
    currency: "USD",
    fiscalYearStart: "07",
    dateFormat: "dmy",
    timezone: "Asia/Dhaka",
  },
  planning: {
    workingHoursPerDay: 8,
    workingDays: [0, 1, 2, 3, 4, 6],
    defaultEfficiency: 60,
    overtimeHours: 2,
    planningHorizonWeeks: 8,
    utilizationWarn: 85,
    utilizationCritical: 100,
    autoGenerateTna: true,
    defaultProcess: "Sewing",
  },
  theme: {
    primary: "#0f766e",
    density: "comfortable",
    sidebarStyle: "dark",
  },
  modules: Object.fromEntries(MODULE_LIST.map((m) => [m.key, true])),
  numbering: {
    orderPrefix: "ORD-",
    stylePrefix: "ST-",
    padding: 4,
  },
  orderStatuses: [
    { key: "inquiry", label: "Inquiry", color: "#64748b" },
    { key: "confirmed", label: "Confirmed", color: "#2563eb" },
    { key: "in_production", label: "In Production", color: "#d97706" },
    { key: "completed", label: "Completed", color: "#16a34a" },
    { key: "shipped", label: "Shipped", color: "#0f766e" },
    { key: "cancelled", label: "Cancelled", color: "#dc2626" },
  ],
  priorities: [
    { key: "low", label: "Low", color: "#94a3b8" },
    { key: "normal", label: "Normal", color: "#2563eb" },
    { key: "high", label: "High", color: "#d97706" },
    { key: "urgent", label: "Urgent", color: "#dc2626" },
  ],
  bomTypes: ["Fabric", "Trim", "Accessory", "Packaging", "Label", "Thread"],
  units: ["pcs", "yds", "mtr", "kg", "cone", "doz", "gross", "set"],
  shipModes: ["Sea", "Air", "Sea-Air", "Road"],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) {
    return (override === undefined ? base : (override as T)) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = isObject(b) && isObject(v) ? deepMerge(b, v) : v;
  }
  return out as T;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    await ensureSchema();
    const rows = await db.select().from(settings);
    const stored: Record<string, unknown> = {};
    for (const r of rows) stored[r.key] = r.value;
    const merged = deepMerge(defaultSettings, stored);
    // Single-tenant app: the configured factory timezone drives "today" everywhere.
    setActiveTimeZone(merged.company.timezone);
    return merged;
  } catch {
    return defaultSettings;
  }
}

export const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Colombo",
  "Asia/Kathmandu",
  "Asia/Ho_Chi_Minh",
  "Asia/Phnom_Penh",
  "Asia/Jakarta",
  "Asia/Yangon",
  "Asia/Shanghai",
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Asia/Amman",
  "Africa/Addis_Ababa",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "America/New_York",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "UTC",
];

export function statusMeta(list: StatusOption[], key: string): StatusOption {
  return list.find((s) => s.key === key) ?? { key, label: key, color: "#64748b" };
}
