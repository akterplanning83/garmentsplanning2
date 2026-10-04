import type { AppSettings } from "./settings";

export type LineLike = {
  id: number;
  name: string;
  operators: number;
  helpers: number;
  workingHours: number | null;
  efficiency: number;
};

/** Available standard minutes per working day for a line */
export function lineDailyMinutes(line: LineLike, s: AppSettings, efficiencyOverride?: number | null): number {
  const hours = line.workingHours ?? s.planning.workingHoursPerDay;
  const eff = (efficiencyOverride ?? line.efficiency) / 100;
  return line.operators * hours * 60 * eff;
}

/** Pieces per day for a given SMV */
export function lineDailyCapacity(line: LineLike, smv: number, s: AppSettings, efficiencyOverride?: number | null): number {
  if (!smv || smv <= 0) return 0;
  return Math.floor(lineDailyMinutes(line, s, efficiencyOverride) / smv);
}

/** Efficiency % from production output */
export function calcEfficiency(producedQty: number, smv: number, manpower: number, hours: number): number {
  const available = manpower * hours * 60;
  if (!available || !smv) return 0;
  return Math.round(((producedQty * smv) / available) * 1000) / 10;
}

export function utilizationColor(pct: number, s: AppSettings): string {
  if (pct >= s.planning.utilizationCritical) return "#dc2626";
  if (pct >= s.planning.utilizationWarn) return "#d97706";
  if (pct <= 0) return "#94a3b8";
  return "#16a34a";
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtMoney(n: number, currency = "USD"): string {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
