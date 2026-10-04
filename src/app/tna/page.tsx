import Link from "next/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { updateTnaStatusForm } from "@/lib/actions";
import { getSettings } from "@/lib/settings";
import { addDays, diffDays, fmtDate, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

const TNA_COLORS: Record<string, string> = { Pending: "#64748b", "In Progress": "#2563eb", Completed: "#16a34a" };

export default async function TnaPage({ searchParams }: { searchParams: Promise<{ filter?: string; dept?: string; order?: string; q?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const T = today();
  const filter = sp.filter ?? "open";

  const [tasks, departments] = await Promise.all([
    db
      .select({
        id: schema.tnaTasks.id,
        name: schema.tnaTasks.name,
        department: schema.tnaTasks.department,
        plannedStart: schema.tnaTasks.plannedStart,
        plannedEnd: schema.tnaTasks.plannedEnd,
        actualStart: schema.tnaTasks.actualStart,
        actualEnd: schema.tnaTasks.actualEnd,
        status: schema.tnaTasks.status,
        responsible: schema.tnaTasks.responsible,
        orderId: schema.tnaTasks.orderId,
        orderNo: schema.orders.orderNo,
        shipDate: schema.orders.shipDate,
        orderStatus: schema.orders.status,
        buyerName: schema.buyers.name,
        styleName: schema.styles.name,
      })
      .from(schema.tnaTasks)
      .innerJoin(schema.orders, eq(schema.tnaTasks.orderId, schema.orders.id))
      .leftJoin(schema.buyers, eq(schema.orders.buyerId, schema.buyers.id))
      .leftJoin(schema.styles, eq(schema.orders.styleId, schema.styles.id))
      .where(sql`${schema.orders.status} not in ('cancelled')`)
      .orderBy(asc(schema.tnaTasks.plannedEnd), asc(schema.tnaTasks.sortOrder)),
    db.select().from(schema.departments).orderBy(asc(schema.departments.sortOrder)),
  ]);

  const openTasks = tasks.filter((t) => t.status !== "Completed" && t.orderStatus !== "shipped");
  const delayed = openTasks.filter((t) => t.plannedEnd < T);
  const dueWeek = openTasks.filter((t) => t.plannedEnd >= T && t.plannedEnd <= addDays(T, 7));
  const completedLate = tasks.filter((t) => t.status === "Completed" && t.actualEnd && t.actualEnd > t.plannedEnd);

  let list = tasks;
  if (filter === "open") list = openTasks;
  if (filter === "delayed") list = delayed;
  if (filter === "week") list = dueWeek;
  if (filter === "completed") list = tasks.filter((t) => t.status === "Completed");
  if (sp.dept) list = list.filter((t) => t.department === sp.dept);
  if (sp.q) list = list.filter((t) => `${t.name} ${t.orderNo} ${t.buyerName ?? ""} ${t.responsible ?? ""}`.toLowerCase().includes(sp.q!.toLowerCase()));

  const deptStats = departments.map((d) => ({
    name: d.name,
    open: openTasks.filter((t) => t.department === d.name).length,
    delayed: delayed.filter((t) => t.department === d.name).length,
  }));

  const filters = [
    { key: "open", label: "Open", count: openTasks.length },
    { key: "delayed", label: "Delayed", count: delayed.length },
    { key: "week", label: "Due in 7 days", count: dueWeek.length },
    { key: "completed", label: "Completed", count: tasks.filter((t) => t.status === "Completed").length },
    { key: "all", label: "All", count: tasks.length },
  ];

  return (
    <>
      <PageHeader title="Time & Action" subtitle="Cross-order critical path tracking · templates configurable in Settings" actions={<Link href="/settings/tna" className="btn btn-secondary btn-sm">Manage templates</Link>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open tasks" value={openTasks.length} icon="◷" color="#2563eb" />
        <StatCard label="Delayed" value={delayed.length} hint="past planned end" icon="!" color="#dc2626" />
        <StatCard label="Due this week" value={dueWeek.length} icon="➤" color="#d97706" />
        <StatCard label="On-time completion" value={`${tasks.filter((t) => t.status === "Completed").length ? Math.round(((tasks.filter((t) => t.status === "Completed").length - completedLate.length) / tasks.filter((t) => t.status === "Completed").length) * 100) : 0}%`} hint={`${completedLate.length} finished late`} icon="✓" color="#16a34a" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-4">
        <Card title="By department" noPad>
          <ul className="divide-y divide-slate-100">
            {deptStats.map((d) => (
              <li key={d.name}>
                <Link href={`/tna?filter=${filter}&dept=${encodeURIComponent(d.name)}`} className={`flex items-center justify-between px-4 py-2 text-xs hover:bg-slate-50 ${sp.dept === d.name ? "bg-brand-soft" : ""}`}>
                  <span className="font-medium text-slate-700">{d.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-500">{d.open} open</span>
                    {d.delayed > 0 && <span className="rounded bg-red-50 px-1.5 font-semibold text-red-700">{d.delayed} late</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-3" noPad>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
            {filters.map((f) => (
              <Link key={f.key} href={`/tna?filter=${f.key}${sp.dept ? `&dept=${encodeURIComponent(sp.dept)}` : ""}`} className={`btn btn-xs ${filter === f.key ? "btn-primary" : "btn-secondary"}`}>
                {f.label} <span className="opacity-75">({f.count})</span>
              </Link>
            ))}
            <form method="get" className="ml-auto flex items-center gap-1">
              <input type="hidden" name="filter" value={filter} />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search…" className="inp inp-sm w-40" />
              {sp.dept && <Link href={`/tna?filter=${filter}`} className="btn btn-ghost btn-xs">✕ {sp.dept}</Link>}
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Order</th>
                  <th>Dept</th>
                  <th>Planned end</th>
                  <th>Ship date</th>
                  <th>Responsible</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 200).map((t) => {
                  const late = t.status !== "Completed" && t.plannedEnd < T;
                  const d = diffDays(T, t.plannedEnd);
                  return (
                    <tr key={t.id} className={late ? "bg-red-50/40" : ""}>
                      <td className="font-medium">{t.name}</td>
                      <td>
                        <Link href={`/orders/${t.orderId}?tab=tna`} className="font-semibold text-brand hover:underline">
                          {t.orderNo}
                        </Link>
                        <div className="text-[11px] text-slate-500">
                          {t.buyerName} · {t.styleName}
                        </div>
                      </td>
                      <td className="text-slate-600">{t.department ?? "—"}</td>
                      <td>
                        <div>{fmtDate(t.plannedEnd, s.company.dateFormat)}</div>
                        {t.status !== "Completed" && <div className={`text-[11px] ${late ? "font-semibold text-red-600" : d <= 3 ? "text-amber-600" : "text-slate-400"}`}>{late ? `${-d}d late` : `in ${d}d`}</div>}
                        {t.status === "Completed" && t.actualEnd && <div className="text-[11px] text-slate-400">done {fmtDate(t.actualEnd, s.company.dateFormat)}</div>}
                      </td>
                      <td>{fmtDate(t.shipDate, s.company.dateFormat)}</td>
                      <td className="text-slate-600">{t.responsible ?? "—"}</td>
                      <td>
                        <Badge label={t.status} color={TNA_COLORS[t.status] ?? "#64748b"} />
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {t.status === "Pending" && (
                          <form action={updateTnaStatusForm.bind(null, t.id)} className="inline">
                            <input type="hidden" name="status" value="In Progress" />
                            <button className="btn btn-secondary btn-xs">Start</button>
                          </form>
                        )}
                        {t.status !== "Completed" && (
                          <form action={updateTnaStatusForm.bind(null, t.id)} className="ml-1 inline">
                            <input type="hidden" name="status" value="Completed" />
                            <button className="btn btn-primary btn-xs">Complete</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 && <EmptyState title="No tasks in this view" />}
            {list.length > 200 && <div className="px-4 py-2 text-xs text-slate-500">Showing first 200 of {list.length} tasks – refine filters.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}

