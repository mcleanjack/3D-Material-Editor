import { useAppStore } from '../../store/useAppStore'
import { PanelShell } from './PanelShell'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block px-3 py-2.5">
      <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-dim)]">{label}</span>
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: 'var(--panel-border)' }}>
      <span className="text-xs font-medium text-[var(--text)]">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-[#3a3d45]'}`}
      >
        <span
          className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export function SunSettingsPanel() {
  const setActiveRightPanel = useAppStore((s) => s.setActiveRightPanel)
  const sunSettings = useAppStore((s) => s.sunSettings)
  const setSunSettings = useAppStore((s) => s.setSunSettings)
  const modelRoot = useAppStore((s) => s.modelRoot)

  return (
    <PanelShell title="Sun" onClose={() => setActiveRightPanel(null)}>
      <Toggle label="Sun" checked={sunSettings.enabled} onChange={(v) => setSunSettings({ enabled: v })} />

      {!modelRoot && (
        <p className="px-3 pt-2.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
          Import an FBX to preview shadows against your model — the sun still lights an empty scene without one.
        </p>
      )}

      <fieldset disabled={!sunSettings.enabled} className="disabled:opacity-40">
        <Field label={`Horizontal Direction: ${Math.round(sunSettings.azimuth)}°`}>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={sunSettings.azimuth}
            onChange={(e) => setSunSettings({ azimuth: Number(e.target.value) })}
            className="w-full"
          />
        </Field>

        <Field label={`Elevation: ${Math.round(sunSettings.elevation)}°`}>
          <input
            type="range"
            min={0}
            max={90}
            step={1}
            value={sunSettings.elevation}
            onChange={(e) => setSunSettings({ elevation: Number(e.target.value) })}
            className="w-full"
          />
        </Field>

        <Field label={`Intensity: ${sunSettings.intensity.toFixed(1)}`}>
          <input
            type="range"
            min={0}
            max={8}
            step={0.1}
            value={sunSettings.intensity}
            onChange={(e) => setSunSettings({ intensity: Number(e.target.value) })}
            className="w-full"
          />
        </Field>

        <Toggle
          label="Shadows"
          checked={sunSettings.shadowsEnabled}
          onChange={(v) => setSunSettings({ shadowsEnabled: v })}
        />

        <fieldset disabled={!sunSettings.shadowsEnabled} className="disabled:opacity-40">
          <Field label={`Shadow Softness: ${sunSettings.shadowSoftness.toFixed(1)} (0 = hard-edged, 10 = soft/blurred)`}>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={sunSettings.shadowSoftness}
              onChange={(e) => setSunSettings({ shadowSoftness: Number(e.target.value) })}
              className="w-full"
            />
          </Field>
        </fieldset>
      </fieldset>

      <p className="border-t px-3 py-3 text-[10px] leading-relaxed text-[var(--text-faint)]" style={{ borderColor: 'var(--panel-border)' }}>
        Viewport preview only — the sun, shadows and ground shadow-catcher are never embedded in the exported
        GLB and never change any material property. Your preferred sun setup is saved with the project,
        separately from material/export data.
      </p>
    </PanelShell>
  )
}
