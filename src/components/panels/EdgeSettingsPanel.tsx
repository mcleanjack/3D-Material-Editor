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

function ExportToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1 text-xs text-[var(--text)]">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
    </label>
  )
}

export function EdgeSettingsPanel() {
  const setActiveRightPanel = useAppStore((s) => s.setActiveRightPanel)
  const edgeSettings = useAppStore((s) => s.edgeSettings)
  const setEdgeSettings = useAppStore((s) => s.setEdgeSettings)
  const modelRoot = useAppStore((s) => s.modelRoot)
  const exportSettings = useAppStore((s) => s.exportSettings)
  const setExportSettings = useAppStore((s) => s.setExportSettings)

  return (
    <PanelShell title="Component Edge Settings" onClose={() => setActiveRightPanel(null)}>
      {!modelRoot && (
        <p className="px-3 py-4 text-xs text-[var(--text-faint)]">Import an FBX to configure component edges.</p>
      )}

      <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: 'var(--panel-border)' }}>
        <span className="text-xs font-medium text-[var(--text)]">Show Component Edges</span>
        <button
          role="switch"
          aria-checked={edgeSettings.enabled}
          onClick={() => setEdgeSettings({ enabled: !edgeSettings.enabled })}
          className={`h-5 w-9 rounded-full transition-colors ${edgeSettings.enabled ? 'bg-blue-600' : 'bg-[#3a3d45]'}`}
        >
          <span
            className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-transform ${
              edgeSettings.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <Field label={`Edge Line Weight: ${edgeSettings.lineWeight.toFixed(1)}px`}>
        <input
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={edgeSettings.lineWeight}
          onChange={(e) => setEdgeSettings({ lineWeight: Number(e.target.value) })}
          className="w-full"
        />
      </Field>

      <Field label="Edge Colour">
        <input
          type="color"
          className="h-8 w-16 cursor-pointer rounded border border-[var(--panel-border)] bg-transparent"
          value={edgeSettings.color}
          onChange={(e) => setEdgeSettings({ color: e.target.value })}
        />
      </Field>

      <Field label={`Edge Opacity: ${Math.round(edgeSettings.opacity * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={edgeSettings.opacity}
          onChange={(e) => setEdgeSettings({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </Field>

      <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--panel-border)' }}>
        <Field label={`Angle Threshold: ${edgeSettings.angleThreshold}° (advanced — faces meeting at a sharper angle are treated as a real edge)`}>
          <input
            type="range"
            min={1}
            max={89}
            step={1}
            value={edgeSettings.angleThreshold}
            onChange={(e) => setEdgeSettings({ angleThreshold: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <p className="px-3 pb-3 text-[10px] leading-relaxed text-[var(--text-faint)]">
        Edges are generated per component from each object's own geometry boundary and sharp creases — not
        every triangulated mesh edge — so the result reads as a clean construction-detail outline rather
        than a technical wireframe.
      </p>

      <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--panel-border)' }}>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]">GLB Export Settings</h3>
        <ExportToggle
          label="Model Materials"
          checked={exportSettings.includeMaterials}
          onChange={(v) => setExportSettings({ includeMaterials: v })}
        />
        <ExportToggle
          label="Textures"
          checked={exportSettings.includeTextures}
          onChange={(v) => setExportSettings({ includeTextures: v })}
        />
        <ExportToggle
          label="Component Edges"
          checked={exportSettings.includeEdges}
          onChange={(v) => setExportSettings({ includeEdges: v })}
        />
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-faint)]">
          Component Edges export as a separate <code>__COMPONENT_EDGES__</code> mesh using the weight,
          colour and opacity above, baked as real geometry (glTF has no line-width concept).
        </p>
      </div>
    </PanelShell>
  )
}
