import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function TnaTemplatesSettings({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const [templates, tasks, departments] = await Promise.all([
    db.select().from(schema.tnaTemplates).orderBy(asc(schema.tnaTemplates.name)),
    db.select().from(schema.tnaTemplateTasks).orderBy(asc(schema.tnaTemplateTasks.sortOrder)),
    db.select().from(schema.departments).orderBy(asc(schema.departments.sortOrder)),
  ]);
  const selected = templates.find((t) => String(t.id) === sp.t) ?? templates.find((t) => t.isDefault) ?? templates[0];
  const selTasks = selected ? tasks.filter((t) => t.templateId === selected.id) : [];

  const tplFields: FieldDef[] = [
    { name: "name", label: "Template name", required: true, span: 2 },
    { name: "description", label: "Description", type: "textarea", span: 2 },
    { name: "isDefault", label: "Default template for new orders", type: "checkbox" },
  ];
  const taskFields: FieldDef[] = [
    { name: "name", label: "Task / milestone", required: true, span: 2 },
    { name: "department", label: "Department", type: "select", options: departments.map((d) => ({ value: d.name, label: d.name })) },
    {
      name: "anchor",
      label: "Anchor date",
      type: "select",
      options: [
        { value: "order", label: "Order date (+ offset)" },
        { value: "ship", label: "Ship date (− lead)" },
      ],
      defaultValue: "ship",
      required: true,
    },
    { name: "offsetDays", label: "Offset days", type: "number", required: true, help: "Negative = days before anchor (e.g. -35 before ship)" },
    { name: "durationDays", label: "Duration (days)", type: "number", required: true, defaultValue: 1 },
    { name: "sortOrder", label: "Sequence", type: "number", defaultValue: selTasks.length + 1 },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Card title="Templates" noPad actions={<CrudModal entity="tnaTemplates" title="Template" fields={tplFields} variant="secondary" />}>
        <ul className="divide-y divide-slate-100">
          {templates.map((t) => (
            <li key={t.id} className={`flex items-center justify-between gap-2 px-4 py-2.5 ${selected?.id === t.id ? "bg-brand-soft" : ""}`}>
              <a href={`/settings/tna?t=${t.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {t.name}
                  {t.isDefault && <Badge label="Default" color="#0f766e" />}
                </div>
                <div className="text-[11px] text-slate-500">
                  {tasks.filter((x) => x.templateId === t.id).length} tasks · {t.description}
                </div>
              </a>
              <div className="flex shrink-0 items-center">
                <CrudModal entity="tnaTemplates" title="Template" fields={tplFields} initial={t} variant="icon" />
                <DeleteButton entity="tnaTemplates" id={t.id} />
              </div>
            </li>
          ))}
        </ul>
        {templates.length === 0 && <EmptyState title="No templates" hint="Create a template, then add milestones." />}
      </Card>

      <Card
        title={selected ? `Tasks in “${selected.name}”` : "Tasks"}
        className="xl:col-span-2"
        noPad
        actions={selected && <CrudModal entity="tnaTemplateTasks" title="Milestone" fields={taskFields} hidden={{ templateId: selected.id }} variant="primary" />}
      >
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Milestone</th>
                <th>Department</th>
                <th>Anchor</th>
                <th className="num">Offset</th>
                <th className="num">Duration</th>
                <th>Example (ship in 90d)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selTasks.map((t) => {
                const dayFromOrder = t.anchor === "order" ? t.offsetDays : 90 + t.offsetDays;
                return (
                  <tr key={t.id}>
                    <td className="text-slate-400">{t.sortOrder}</td>
                    <td className="font-medium">{t.name}</td>
                    <td className="text-slate-600">{t.department ?? "—"}</td>
                    <td>
                      <Badge label={t.anchor === "order" ? "Order date" : "Ship date"} color={t.anchor === "order" ? "#2563eb" : "#d97706"} />
                    </td>
                    <td className="num">{t.offsetDays > 0 ? `+${t.offsetDays}` : t.offsetDays}</td>
                    <td className="num">{t.durationDays}d</td>
                    <td className="text-xs text-slate-500">
                      day {dayFromOrder} → {dayFromOrder + t.durationDays - 1}
                      <div className="mt-0.5 h-1.5 w-40 rounded bg-slate-100">
                        <div className="h-full rounded bg-brand" style={{ marginLeft: `${Math.max(0, Math.min(100, (dayFromOrder / 90) * 100))}%`, width: `${Math.max(2, (t.durationDays / 90) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <CrudModal entity="tnaTemplateTasks" title="Milestone" fields={taskFields} initial={t} hidden={{ templateId: t.templateId }} variant="icon" />
                      <DeleteButton entity="tnaTemplateTasks" id={t.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selTasks.length === 0 && <EmptyState title="No milestones" hint="Add milestones anchored to order date (forward) or ship date (backward)." />}
        </div>
      </Card>
    </div>
  );
}
