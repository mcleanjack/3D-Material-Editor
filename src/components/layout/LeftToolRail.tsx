import { useAppStore, type ActiveTool } from '../../store/useAppStore'
import { Icon, type IconName } from '../common/Icon'

function RailButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: IconName
  label: string
  active?: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${
        active ? 'bg-blue-600 text-white' : 'text-[var(--text-dim)] hover:bg-white/10 hover:text-[var(--text)]'
      }`}
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

const TOOLS: { tool: ActiveTool; icon: IconName; label: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select' },
  { tool: 'orbit', icon: 'orbit', label: 'Orbit' },
  { tool: 'pan', icon: 'pan', label: 'Pan' },
  { tool: 'zoom', icon: 'zoom', label: 'Zoom' },
  { tool: 'measure', icon: 'measure', label: 'Measure (coming soon)' },
]

export function LeftToolRail() {
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const wireframe = useAppStore((s) => s.wireframe)
  const setWireframe = useAppStore((s) => s.setWireframe)
  const projection = useAppStore((s) => s.projection)
  const setProjection = useAppStore((s) => s.setProjection)
  const gridVisible = useAppStore((s) => s.gridVisible)
  const setGridVisible = useAppStore((s) => s.setGridVisible)
  const axesVisible = useAppStore((s) => s.axesVisible)
  const setAxesVisible = useAppStore((s) => s.setAxesVisible)
  const fitToScreen = useAppStore((s) => s.fitToScreen)
  const resetCamera = useAppStore((s) => s.resetCamera)
  const isolateActive = useAppStore((s) => s.isolateActive)
  const isolateSelected = useAppStore((s) => s.isolateSelected)
  const exitIsolate = useAppStore((s) => s.exitIsolate)
  const showAll = useAppStore((s) => s.showAll)
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const modelRoot = useAppStore((s) => s.modelRoot)

  return (
    <div
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2"
      style={{ background: 'var(--rail-bg)', borderColor: 'var(--panel-border)' }}
    >
      {TOOLS.map((t) => (
        <RailButton
          key={t.tool}
          icon={t.icon}
          label={t.label}
          active={activeTool === t.tool}
          disabled={t.tool === 'measure'}
          onClick={() => setActiveTool(t.tool)}
        />
      ))}

      <div className="my-1 h-px w-6 bg-[var(--panel-border)]" />

      <RailButton icon="wireframe" label="Wireframe" active={wireframe} onClick={() => setWireframe(!wireframe)} />
      <RailButton
        icon="isolate"
        label={isolateActive ? 'Exit Isolate' : 'Isolate Selected'}
        active={isolateActive}
        disabled={!isolateActive && selectedComponentIds.length === 0}
        onClick={() => (isolateActive ? exitIsolate() : isolateSelected())}
      />
      <RailButton icon="eye" label="Show All" disabled={!modelRoot} onClick={showAll} />

      <div className="my-1 h-px w-6 bg-[var(--panel-border)]" />

      <RailButton
        icon={projection === 'perspective' ? 'perspective' : 'orthographic'}
        label={projection === 'perspective' ? 'Switch to Orthographic' : 'Switch to Perspective'}
        onClick={() => setProjection(projection === 'perspective' ? 'orthographic' : 'perspective')}
      />
      <RailButton icon="fit" label="Fit to Screen" disabled={!modelRoot} onClick={fitToScreen} />
      <RailButton icon="resetCamera" label="Reset Camera" disabled={!modelRoot} onClick={resetCamera} />

      <div className="my-1 h-px w-6 bg-[var(--panel-border)]" />

      <RailButton icon="grid" label="Toggle Grid" active={gridVisible} onClick={() => setGridVisible(!gridVisible)} />
      <RailButton icon="axes" label="Toggle Axes" active={axesVisible} onClick={() => setAxesVisible(!axesVisible)} />
    </div>
  )
}
