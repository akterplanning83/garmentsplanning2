import Link from "next/link";
import { Card, Field, PageHeader } from "@/components/ui";
import { FormShell } from "@/components/client-bits";
import { createOrder } from "@/lib/actions";
import { getCustomFields, getLookups } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { addDays, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ styleId?: string; buyerId?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const [lk, cfs] = await Promise.all([getLookups(), getCustomFields("orders")]);
  const preStyle = lk.styles.find((st) => String(st.id) === sp.styleId);
  const defaultTemplate = lk.templates.find((t) => t.isDefault);

  return (
    <>
      <PageHeader
        title="New Order"
        subtitle="Create a buyer purchase order. TNA calendar is generated automatically from the selected template."
        actions={
          <Link href="/orders" className="btn btn-ghost btn-sm">
            ← Orders
          </Link>
        }
      />
      <Card className="max-w-5xl">
        <FormShell action={createOrder} submitLabel="Create order" cancelHref="/orders">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Order details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Order no" help={`Leave blank to auto-number (${s.numbering.orderPrefix}…)`}>
              <input name="orderNo" className="inp" placeholder="auto" />
            </Field>
            <Field label="Buyer PO number">
              <input name="poNumber" className="inp" />
            </Field>
            <Field label="Buyer *">
              <select name="buyerId" className="inp" required defaultValue={sp.buyerId ?? (preStyle?.buyerId ? String(preStyle.buyerId) : "")}>
                <option value="">Select buyer…</option>
                {lk.buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Style *" span={2}>
              <select name="styleId" className="inp" required defaultValue={sp.styleId ?? ""}>
                <option value="">Select style…</option>
                {lk.styles.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.styleNo} · {st.name} ({lk.buyers.find((b) => b.id === st.buyerId)?.name ?? "—"}) · SMV {st.smv}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SMV override" help="Blank = use style SMV">
              <input name="smv" type="number" step="0.01" className="inp" placeholder={preStyle ? String(preStyle.smv) : "from style"} />
            </Field>
            <Field label="Order date *">
              <input name="orderDate" type="date" className="inp" required defaultValue={today()} />
            </Field>
            <Field label="Ship date *">
              <input name="shipDate" type="date" className="inp" required defaultValue={addDays(today(), 75)} />
            </Field>
            <Field label="Ship mode">
              <select name="shipMode" className="inp" defaultValue={s.shipModes[0]}>
                {s.shipModes.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity (pcs) *">
              <input name="quantity" type="number" min={1} className="inp" required />
            </Field>
            <Field label="Unit price (FOB)">
              <input name="unitPrice" type="number" step="0.001" className="inp" defaultValue={0} />
            </Field>
            <Field label="Currency">
              <input name="currency" className="inp" defaultValue={s.company.currency} />
            </Field>
            <Field label="Status">
              <select name="status" className="inp" defaultValue="confirmed">
                {s.orderStatuses.map((st) => (
                  <option key={st.key} value={st.key}>
                    {st.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" className="inp" defaultValue="normal">
                {s.priorities.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination">
              <input name="destination" className="inp" placeholder="Port / city" />
            </Field>
            <Field label="TNA template" help="Generates the time & action calendar">
              <select name="tnaTemplateId" className="inp" defaultValue={defaultTemplate ? String(defaultTemplate.id) : ""}>
                <option value="">No TNA</option>
                {lk.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Remarks" span={2}>
              <input name="remarks" className="inp" />
            </Field>
          </div>

          {cfs.length > 0 && (
            <>
              <h3 className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-slate-500">Custom fields</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {cfs.map((cf) => (
                  <Field key={cf.id} label={cf.label + (cf.required ? " *" : "")}>
                    {cf.type === "select" ? (
                      <select name={`cf_${cf.fieldKey}`} className="inp" required={cf.required}>
                        <option value="">—</option>
                        {(cf.options ?? "")
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean)
                          .map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                      </select>
                    ) : cf.type === "checkbox" ? (
                      <select name={`cf_${cf.fieldKey}`} className="inp">
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    ) : (
                      <input name={`cf_${cf.fieldKey}`} type={cf.type === "number" ? "number" : cf.type === "date" ? "date" : "text"} className="inp" required={cf.required} />
                    )}
                  </Field>
                ))}
              </div>
            </>
          )}
        </FormShell>
      </Card>
    </>
  );
}
