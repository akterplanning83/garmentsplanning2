import { Card, Field } from "@/components/ui";
import { ActionForm } from "@/components/client-bits";
import { saveSettings } from "@/lib/actions";
import { getSettings, TIMEZONES } from "@/lib/settings";
import { today } from "@/lib/dates";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function GeneralSettings() {
  const s = await getSettings();
  const processes = await db.select().from(schema.processes).orderBy(asc(schema.processes.sortOrder));
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title="Company profile">
        <ActionForm action={saveSettings.bind(null, "company")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company name">
              <input name="name" defaultValue={s.company.name} className="inp" required />
            </Field>
            <Field label="Short name / logo text">
              <input name="shortName" defaultValue={s.company.shortName} className="inp" maxLength={6} />
            </Field>
            <Field label="Address" span={2}>
              <input name="address" defaultValue={s.company.address} className="inp" />
            </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={s.company.phone} className="inp" />
            </Field>
            <Field label="Email">
              <input name="email" defaultValue={s.company.email} className="inp" />
            </Field>
            <Field label="Base currency">
              <select name="currency" defaultValue={s.company.currency} className="inp">
                {["USD", "EUR", "GBP", "BDT", "INR", "CNY", "JPY", "PKR", "LKR", "VND"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Date format">
              <select name="dateFormat" defaultValue={s.company.dateFormat} className="inp">
                <option value="dmy">31 Dec 2026</option>
                <option value="mdy">Dec 31, 2026</option>
                <option value="ymd">2026-12-31</option>
              </select>
            </Field>
            <Field label="Fiscal year start month">
              <select name="fiscalYearStart" defaultValue={s.company.fiscalYearStart} className="inp">
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2026, Number(m) - 1, 1).toLocaleString("en-US", { month: "long" })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Factory timezone" span={2} help={`Drives "today" for planning, TNA and production. Server date now: ${today()}`}>
              <select name="timezone" defaultValue={s.company.timezone} className="inp">
                {(TIMEZONES.includes(s.company.timezone) ? TIMEZONES : [s.company.timezone, ...TIMEZONES]).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      <Card title="Planning rules">
        <ActionForm action={saveSettings.bind(null, "planning")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Standard working hours / day">
              <input name="workingHoursPerDay" type="number" step="0.5" defaultValue={s.planning.workingHoursPerDay} className="inp" />
            </Field>
            <Field label="Allowed overtime hours / day">
              <input name="overtimeHours" type="number" step="0.5" defaultValue={s.planning.overtimeHours} className="inp" />
            </Field>
            <div className="sm:col-span-2">
              <span className="lbl">Working days</span>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <label key={d} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${s.planning.workingDays.includes(i) ? "border-brand bg-brand-soft" : "border-slate-200"}`}>
                    <input type="checkbox" name="workingDays" value={i} defaultChecked={s.planning.workingDays.includes(i)} className="accent-[var(--brand)]" />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Default line efficiency %">
              <input name="defaultEfficiency" type="number" step="0.1" defaultValue={s.planning.defaultEfficiency} className="inp" />
            </Field>
            <Field label="Planning horizon (weeks)">
              <input name="planningHorizonWeeks" type="number" defaultValue={s.planning.planningHorizonWeeks} className="inp" />
            </Field>
            <Field label="Utilization warning at %">
              <input name="utilizationWarn" type="number" defaultValue={s.planning.utilizationWarn} className="inp" />
            </Field>
            <Field label="Utilization critical at %">
              <input name="utilizationCritical" type="number" defaultValue={s.planning.utilizationCritical} className="inp" />
            </Field>
            <Field label="Default process for allocations">
              <select name="defaultProcess" defaultValue={s.planning.defaultProcess} className="inp">
                {(processes.length ? processes.map((p) => p.name) : ["Sewing"]).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <input type="checkbox" name="autoGenerateTna" defaultChecked={s.planning.autoGenerateTna} className="accent-[var(--brand)]" />
              Auto-generate TNA from default template on new orders
            </label>
          </div>
        </ActionForm>
      </Card>

      <Card title="Document numbering">
        <ActionForm action={saveSettings.bind(null, "numbering")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Order prefix">
              <input name="orderPrefix" defaultValue={s.numbering.orderPrefix} className="inp" />
            </Field>
            <Field label="Style prefix">
              <input name="stylePrefix" defaultValue={s.numbering.stylePrefix} className="inp" />
            </Field>
            <Field label="Number padding">
              <input name="padding" type="number" min={1} max={8} defaultValue={s.numbering.padding} className="inp" />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Preview: {s.numbering.orderPrefix}
            {"1".padStart(s.numbering.padding, "0")}
          </p>
        </ActionForm>
      </Card>

      <Card title="Option lists">
        <ActionForm action={saveSettings.bind(null, "lists")}>
          <div className="grid grid-cols-1 gap-3">
            <Field label="BOM item types (comma separated)">
              <input name="bomTypes" defaultValue={s.bomTypes.join(", ")} className="inp" />
            </Field>
            <Field label="Units of measure">
              <input name="units" defaultValue={s.units.join(", ")} className="inp" />
            </Field>
            <Field label="Shipment modes">
              <input name="shipModes" defaultValue={s.shipModes.join(", ")} className="inp" />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
