import { Card, Field } from "@/components/ui";
import { ActionForm } from "@/components/client-bits";
import { saveSettings } from "@/lib/actions";
import { getSettings, MODULE_LIST } from "@/lib/settings";

export const dynamic = "force-dynamic";

const PRESETS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#dc2626", "#0891b2", "#4f46e5", "#0f172a"];

export default async function AppearanceSettings() {
  const s = await getSettings();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title="Theme">
        <ActionForm action={saveSettings.bind(null, "theme")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Primary / brand color" span={2}>
              <div className="flex flex-wrap items-center gap-2">
                <input type="color" name="primary" defaultValue={s.theme.primary} className="h-10 w-16 cursor-pointer rounded border border-slate-300" />
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((c) => (
                    <span key={c} className="h-6 w-6 rounded-full border border-white shadow" style={{ background: c }} title={c} />
                  ))}
                </div>
                <span className="text-xs text-slate-500">Current: {s.theme.primary}</span>
              </div>
            </Field>
            <Field label="Density">
              <select name="density" defaultValue={s.theme.density} className="inp">
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact (more rows on screen)</option>
              </select>
            </Field>
            <Field label="Sidebar style">
              <select name="sidebarStyle" defaultValue={s.theme.sidebarStyle} className="inp">
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      <Card title="Modules (show / hide in navigation)">
        <ActionForm action={saveSettings.bind(null, "modules")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODULE_LIST.map((m) => {
              const locked = m.key === "dashboard" || m.key === "settings";
              return (
                <label key={m.key} className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm ${locked ? "opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                  <input type="checkbox" name={`module_${m.key}`} defaultChecked={s.modules[m.key] !== false} disabled={locked} className="accent-[var(--brand)]" />
                  <span className="w-5 text-center">{m.icon}</span>
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{m.group}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Dashboard and Settings are always available. Hidden modules remain accessible by URL.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
