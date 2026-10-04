import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc } from "drizzle-orm";
import CrudModal from "@/components/CrudModal";
import { DeleteButton } from "@/components/client-bits";
import { Card, EmptyState } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/dates";
import type { FieldDef } from "@/lib/entities";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function MasterCard<T extends { id: number }>({ title, entity, fields, rows, render, size = "sm" }: { title: string; entity: string; fields: FieldDef[]; rows: T[]; render: (r: T) => ReactNode; size?: "sm" | "md" }) {
  return (
    <Card title={`${title} (${rows.length})`} noPad actions={<CrudModal entity={entity} title={title.replace(/s$/, "")} fields={fields} variant="secondary" size={size} />}>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto scroll-thin">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-1.5 text-sm">
            <div className="min-w-0 flex-1">{render(r)}</div>
            <div className="flex shrink-0 items-center">
              <CrudModal entity={entity} title={title.replace(/s$/, "")} fields={fields} initial={r} variant="icon" size={size} />
              <DeleteButton entity={entity} id={r.id} />
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <EmptyState title={`No ${title.toLowerCase()}`} />}
    </Card>
  );
}

export default async function MasterDataSettings() {
  const s = await getSettings();
  const [colors, sizes, categories, departments, processes, holidays] = await Promise.all([
    db.select().from(schema.colors).orderBy(asc(schema.colors.name)),
    db.select().from(schema.sizes).orderBy(asc(schema.sizes.sortOrder)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.name)),
    db.select().from(schema.departments).orderBy(asc(schema.departments.sortOrder)),
    db.select().from(schema.processes).orderBy(asc(schema.processes.sortOrder)),
    db.select().from(schema.holidays).orderBy(asc(schema.holidays.date)),
  ]);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      <MasterCard
        title="Colors"
        entity="colors"
        rows={colors}
        fields={[
          { name: "name", label: "Color name", required: true, span: 2 },
          { name: "hex", label: "Swatch", type: "color" },
        ]}
        render={(c) => (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border border-slate-200" style={{ background: c.hex ?? "#ccc" }} />
            {c.name}
            <span className="text-[11px] text-slate-400">{c.hex}</span>
          </span>
        )}
      />
      <MasterCard
        title="Sizes"
        entity="sizes"
        rows={sizes}
        fields={[
          { name: "name", label: "Size", required: true },
          { name: "sortOrder", label: "Sort order", type: "number", defaultValue: sizes.length + 1 },
        ]}
        render={(z) => (
          <span>
            <b>{z.name}</b> <span className="text-[11px] text-slate-400">#{z.sortOrder}</span>
          </span>
        )}
      />
      <MasterCard
        title="Product categories"
        entity="categories"
        rows={categories}
        fields={[
          { name: "name", label: "Category", required: true },
          { name: "garmentType", label: "Garment type", type: "select", options: ["Knit", "Woven", "Sweater", "Denim", "Lingerie", "Outerwear"].map((x) => ({ value: x, label: x })), defaultValue: "Knit" },
        ]}
        render={(c) => (
          <span>
            {c.name} <span className="text-[11px] text-slate-400">· {c.garmentType}</span>
          </span>
        )}
      />
      <MasterCard
        title="Departments"
        entity="departments"
        rows={departments}
        fields={[
          { name: "name", label: "Department", required: true },
          { name: "sortOrder", label: "Sort order", type: "number", defaultValue: departments.length + 1 },
        ]}
        render={(d) => <span>{d.name}</span>}
      />
      <MasterCard
        title="Processes"
        entity="processes"
        rows={processes}
        fields={[
          { name: "name", label: "Process", required: true },
          { name: "sortOrder", label: "Sort order", type: "number", defaultValue: processes.length + 1 },
          { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
        ]}
        render={(p) => (
          <span className={p.isActive ? "" : "text-slate-400 line-through"}>
            {p.name}
          </span>
        )}
      />
      <MasterCard
        title="Holidays"
        entity="holidays"
        rows={holidays}
        fields={[
          { name: "date", label: "Date", type: "date", required: true },
          { name: "name", label: "Holiday name", required: true },
        ]}
        render={(h) => (
          <span>
            <b>{fmtDate(h.date, s.company.dateFormat)}</b> <span className="text-slate-500">· {h.name}</span>
          </span>
        )}
      />
    </div>
  );
}
