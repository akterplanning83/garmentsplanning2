import { db } from "@/db";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import { ActionButton } from "@/components/client-bits";
import { Alert, Card } from "@/components/ui";
import { clearAllData, loadDemoData } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function DataSettings() {
  const counts = await Promise.all(
    (
      [
        ["Buyers", schema.buyers],
        ["Suppliers", schema.suppliers],
        ["Styles", schema.styles],
        ["Orders", schema.orders],
        ["Production lines", schema.productionLines],
        ["Plan allocations", schema.planAllocations],
        ["TNA tasks", schema.tnaTasks],
        ["BOM items", schema.bomItems],
        ["Production entries", schema.dailyProduction],
        ["Shipments", schema.shipments],
      ] as const
    ).map(async ([label, table]) => {
      const [r] = await db.select({ c: sql<number>`count(*)` }).from(table);
      return { label, count: Number(r.c) };
    })
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title="Database overview">
        <ul className="divide-y divide-slate-100 text-sm">
          {counts.map((c) => (
            <li key={c.label} className="flex justify-between py-1.5">
              <span className="text-slate-600">{c.label}</span>
              <span className="font-semibold">{c.count}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-5">
        <Card title="Demo dataset">
          <p className="mb-3 text-sm text-slate-600">Replace everything with a realistic demo factory: 2 units, 12 lines, 7 buyers, 10 styles with SMV, 14 orders with breakdowns, BOM, TNA calendars, line plans and daily production history.</p>
          <ActionButton action={loadDemoData} className="btn btn-primary btn-sm" confirmText="This will DELETE all current data and load the demo dataset. Continue?" successMessage="Demo data loaded">
            Reset & load demo data
          </ActionButton>
        </Card>
        <Card title="Danger zone">
          <Alert tone="danger">Clearing removes all transactional and master data, including settings. This cannot be undone.</Alert>
          <div className="mt-3">
            <ActionButton action={clearAllData} className="btn btn-danger btn-sm" confirmText="Permanently delete ALL data?" successMessage="All data cleared">
              Clear all data
            </ActionButton>
          </div>
        </Card>
        <Card title="Exports">
          <div className="flex flex-wrap gap-2">
            {["orders", "materials", "production", "tna", "plan"].map((r) => (
              <a key={r} href={`/api/export?report=${r}`} className="btn btn-secondary btn-xs">
                ⇩ {r}.csv
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
