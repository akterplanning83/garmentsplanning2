import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getLines, opts } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { fmtNum, lineDailyCapacity, lineDailyMinutes } from "@/lib/planning";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function LinesSettings() {
  const s = await getSettings();
  const [factories, lines] = await Promise.all([db.select().from(schema.factories).orderBy(asc(schema.factories.name)), getLines()]);

  const factoryFields: FieldDef[] = [
    { name: "name", label: "Factory / unit name", required: true },
    { name: "code", label: "Code" },
    { name: "location", label: "Location", span: 2 },
    { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
  ];
  const lineFields: FieldDef[] = [
    { name: "name", label: "Line name", required: true },
    { name: "code", label: "Code" },
    { name: "factoryId", label: "Factory", type: "select", options: opts(factories, (f) => f.name), required: true },
    { name: "section", label: "Section", type: "select", options: ["Sewing", "Cutting", "Finishing", "Washing", "Printing", "Embroidery", "Packing"].map((x) => ({ value: x, label: x })), defaultValue: "Sewing" },
    { name: "operators", label: "Operators", type: "number", required: true, defaultValue: 30 },
    { name: "helpers", label: "Helpers", type: "number", defaultValue: 8 },
    { name: "machines", label: "Machines", type: "number", defaultValue: 30 },
    { name: "workingHours", label: "Hours / day override", type: "number", step: "0.5", help: `Blank = ${s.planning.workingHoursPerDay}h default` },
    { name: "efficiency", label: "Target efficiency %", type: "number", step: "0.1", required: true, defaultValue: s.planning.defaultEfficiency },
    { name: "sortOrder", label: "Sort order", type: "number", defaultValue: lines.length + 1 },
    { name: "colorHex", label: "Board color", type: "color", defaultValue: "#0f766e" },
    { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Card title="Factories / units" noPad actions={<CrudModal entity="factories" title="Factory" fields={factoryFields} variant="secondary" />}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Factory</th>
              <th>Location</th>
              <th className="num">Lines</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {factories.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-[11px] text-slate-400">{f.code}</div>
                </td>
                <td className="text-slate-600">{f.location ?? "—"}</td>
                <td className="num">{lines.filter((l) => l.factoryId === f.id).length}</td>
                <td className="whitespace-nowrap text-right">
                  <CrudModal entity="factories" title="Factory" fields={factoryFields} initial={f} variant="icon" />
                  <DeleteButton entity="factories" id={f.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {factories.length === 0 && <EmptyState title="No factories" hint="Add your first unit." />}
      </Card>

      <Card title="Production lines" className="xl:col-span-2" noPad actions={<CrudModal entity="productionLines" title="Line" fields={lineFields} variant="primary" size="lg" />}>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Factory</th>
                <th>Section</th>
                <th className="num">Op / Help / Mach</th>
                <th className="num">Hours</th>
                <th className="num">Eff %</th>
                <th className="num">Std min/day</th>
                <th className="num">Pcs/day @SMV 10</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="h-3 w-3 rounded" style={{ background: l.colorHex ?? "#999" }} />
                      {l.name}
                    </span>
                    <div className="text-[11px] text-slate-400">{l.code}</div>
                  </td>
                  <td className="text-slate-600">{l.factoryName ?? "—"}</td>
                  <td>
                    <Badge label={l.section} color={l.section === "Sewing" ? "#0f766e" : "#64748b"} />
                  </td>
                  <td className="num">
                    {l.operators} / {l.helpers} / {l.machines}
                  </td>
                  <td className="num">{l.workingHours ?? s.planning.workingHoursPerDay}</td>
                  <td className="num">{l.efficiency}</td>
                  <td className="num">{fmtNum(lineDailyMinutes(l, s))}</td>
                  <td className="num font-semibold">{fmtNum(lineDailyCapacity(l, 10, s))}</td>
                  <td>
                    <Badge label={l.isActive ? "Active" : "Inactive"} color={l.isActive ? "#16a34a" : "#94a3b8"} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <CrudModal entity="productionLines" title="Line" fields={lineFields} initial={l} variant="icon" size="lg" />
                    <DeleteButton entity="productionLines" id={l.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length === 0 && <EmptyState title="No lines" hint="Add sewing, cutting and finishing lines with manpower and efficiency to enable capacity planning." />}
        </div>
      </Card>
    </div>
  );
}
