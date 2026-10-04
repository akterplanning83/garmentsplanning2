import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { ActionForm, DeleteButton, ListEditor } from "@/components/client-bits";
import { Badge, Card, EmptyState } from "@/components/ui";
import { saveSettings } from "@/lib/actions";
import { getSettings } from "@/lib/settings";
import type { FieldDef } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function FieldsSettings() {
  const s = await getSettings();
  const fields = await db.select().from(schema.customFields).orderBy(asc(schema.customFields.entity), asc(schema.customFields.sortOrder));

  const cfFields: FieldDef[] = [
    {
      name: "entity",
      label: "Applies to",
      type: "select",
      options: [
        { value: "orders", label: "Orders" },
        { value: "styles", label: "Styles" },
        { value: "buyers", label: "Buyers" },
      ],
      required: true,
    },
    { name: "type", label: "Field type", type: "select", options: ["text", "number", "date", "select", "checkbox"].map((x) => ({ value: x, label: x })), required: true, defaultValue: "text" },
    { name: "label", label: "Label", required: true },
    { name: "fieldKey", label: "Key (no spaces)", required: true, placeholder: "merchandiser" },
    { name: "options", label: "Options for select (comma separated)", span: 2 },
    { name: "sortOrder", label: "Sort order", type: "number", defaultValue: fields.length + 1 },
    { name: "required", label: "Required", type: "checkbox" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title="Custom fields" noPad actions={<CrudModal entity="customFields" title="Custom field" fields={cfFields} variant="primary" />}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Label</th>
              <th>Key</th>
              <th>Type</th>
              <th>Options</th>
              <th>Req.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id}>
                <td>
                  <Badge label={f.entity} color="#2563eb" />
                </td>
                <td className="font-medium">{f.label}</td>
                <td className="font-mono text-xs text-slate-500">{f.fieldKey}</td>
                <td>{f.type}</td>
                <td className="max-w-[200px] truncate text-xs text-slate-500">{f.options ?? "—"}</td>
                <td>{f.required ? "✓" : ""}</td>
                <td className="whitespace-nowrap text-right">
                  <CrudModal entity="customFields" title="Custom field" fields={cfFields} initial={f} variant="icon" />
                  <DeleteButton entity="customFields" id={f.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fields.length === 0 && <EmptyState title="No custom fields" hint="Add fields to capture buyer-specific data on orders, styles or buyers." />}
        <p className="px-4 py-2 text-xs text-slate-500">Custom fields appear automatically on the create/edit forms and list views of the selected entity.</p>
      </Card>

      <div className="space-y-5">
        <Card title="Order statuses">
          <ActionForm action={saveSettings.bind(null, "orderStatuses")}>
            <ListEditor initial={s.orderStatuses} />
            <p className="mt-2 text-xs text-slate-500">
              Keys <code>confirmed</code>, <code>in_production</code>, <code>completed</code>, <code>shipped</code>, <code>cancelled</code> drive planning logic — rename labels freely, but keep those keys.
            </p>
          </ActionForm>
        </Card>
        <Card title="Order priorities">
          <ActionForm action={saveSettings.bind(null, "priorities")}>
            <ListEditor initial={s.priorities} />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
