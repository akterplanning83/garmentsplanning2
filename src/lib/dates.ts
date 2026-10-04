export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/* ------------------------------------------------------------------ */
/*  "Today" is evaluated in the factory's timezone, not the server's.  */
/*  Hosted servers (Netlify, AWS…) run in UTC; without this, the date  */
/*  would flip in the middle of the working day for Asian factories.   */
/* ------------------------------------------------------------------ */
const DEFAULT_TIMEZONE = "Asia/Dhaka";
let activeTimeZone = DEFAULT_TIMEZONE;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function setActiveTimeZone(tz: string | undefined | null): void {
  if (tz && isValidTimeZone(tz)) activeTimeZone = tz;
}

export function getActiveTimeZone(): string {
  return activeTimeZone;
}

export function today(): string {
  let f = formatterCache.get(activeTimeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: activeTimeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatterCache.set(activeTimeZone, f);
  }
  const parts = f.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(a: string, b: string): number {
  const da = parseISO(a).getTime();
  const dbb = parseISO(b).getTime();
  return Math.round((dbb - da) / 86400000);
}

export function startOfWeek(iso: string, weekStartsOn = 6): string {
  const d = parseISO(iso);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function fmtDate(iso: string | null | undefined, format: "dmy" | "mdy" | "ymd" = "dmy"): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en-US", { month: "short" });
  const yy = d.getFullYear();
  if (format === "ymd") return `${yy}-${String(d.getMonth() + 1).padStart(2, "0")}-${dd}`;
  if (format === "mdy") return `${mon} ${dd}, ${yy}`;
  return `${dd} ${mon} ${yy}`;
}

export function shortDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
}

export function dayName(iso: string): string {
  return parseISO(iso).toLocaleString("en-US", { weekday: "short" });
}

export function isWorkingDay(iso: string, workingDays: number[], holidaySet: Set<string>): boolean {
  if (holidaySet.has(iso)) return false;
  return workingDays.includes(parseISO(iso).getDay());
}

/** Returns list of ISO dates from start (inclusive) for `count` days */
export function dateRange(start: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDays(start, i));
  return out;
}

/** Count working days between two ISO dates (inclusive) */
export function workingDaysBetween(
  start: string,
  end: string,
  workingDays: number[],
  holidaySet: Set<string>
): number {
  if (end < start) return 0;
  let n = 0;
  let cur = start;
  while (cur <= end) {
    if (isWorkingDay(cur, workingDays, holidaySet)) n++;
    cur = addDays(cur, 1);
  }
  return n;
}

/** Given a start date and required number of working days, return the end date */
export function endDateForWorkingDays(
  start: string,
  neededDays: number,
  workingDays: number[],
  holidaySet: Set<string>
): string {
  let remaining = Math.max(1, Math.ceil(neededDays));
  let cur = start;
  let guard = 0;
  while (guard < 2000) {
    if (isWorkingDay(cur, workingDays, holidaySet)) {
      remaining--;
      if (remaining <= 0) return cur;
    }
    cur = addDays(cur, 1);
    guard++;
  }
  return cur;
}

export function monthLabel(iso: string): string {
  const d = parseISO(iso);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}
