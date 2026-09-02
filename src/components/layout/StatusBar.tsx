import { useAppStore } from '../../store/useAppStore'
import { useMaterialLibraryStore } from '../../store/useMaterialLibraryStore'

const TOOL_LABELS: Record<string, string> = {
  select: 'Select — click an object to select it, shift-click to add to selection',
  orbit: 'Orbit — drag to rotate the view',
  pan: 'Pan — drag to pan the view',
  zoom: 'Zoom — scroll or drag to zoom',
  measure: 'Measure',
}

export function StatusBar() {
  const activeTool = useAppStore((s) => s.activeTool)
  const statusMessage = useAppStore((s) => s.statusMessage)
  const hoveredComponentId = useAppStore((s) => s.hoveredComponentId)
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const objectMeta = useAppStore((s) => s.objectMeta)
  const materialAssignments = useAppStore((s) => s.materialAssignments)
  const applyingMaterials = useAppStore((s) => s.applyingMaterials)
  const getMaterial = useMaterialLibraryStore((s) => s.getById)

  const infoId = hoveredComponentId ?? selectedComponentIds[selectedComponentIds.length - 1] ?? null
  const info = infoId ? objectMeta.get(infoId) : null
  const assignedMaterialId = infoId ? materialAssignments[infoId] : undefined
  const assignedMaterial = assignedMaterialId ? getMaterial(assignedMaterialId) : undefined

  return (
    <div
      className="flex h-6 shrink-0 items-center gap-4 border-t px-3 text-[11px] text-[var(--text-dim)]"
      style={{ background: 'var(--statusbar-bg)', borderColor: 'var(--panel-border)' }}
    >
      <span className="text-[var(--text-faint)]">{TOOL_LABELS[activeTool] ?? activeTool}</span>

      {info && (
        <span className="truncate">
          <strong className="text-[var(--text)]">{info.name}</strong>
          {info.fbxMaterialNames.length > 0 && <> · FBX material: {info.fbxMaterialNames.join(', ')}</>}
          {assignedMaterial && <> · Assigned: {assignedMaterial.name}</>}
        </span>
      )}

      {applyingMaterials && <span className="text-blue-400">Applying materials…</span>}

      <div className="flex-1" />

      {selectedComponentIds.length > 0 && <span>{selectedComponentIds.length} selected</span>}

      <span className="truncate">{statusMessage}</span>
    </div>
  )
}
