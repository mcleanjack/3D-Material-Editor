import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { ObjectTreeNode } from '../../types/tree'
import { Icon } from '../common/Icon'
import { PanelShell } from './PanelShell'
import { MaterialPicker } from './MaterialPicker'

function nodeMatchesSearch(node: ObjectTreeNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true
  return node.children.some((c) => nodeMatchesSearch(c, query))
}

function TreeRow({ node, depth, query }: { node: ObjectTreeNode; depth: number; query: string }) {
  const [expanded, setExpanded] = useState(true)
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const hoveredComponentId = useAppStore((s) => s.hoveredComponentId)
  const hiddenComponentIds = useAppStore((s) => s.hiddenComponentIds)
  const selectComponent = useAppStore((s) => s.selectComponent)
  const setHover = useAppStore((s) => s.setHover)
  const toggleVisibility = useAppStore((s) => s.toggleVisibility)

  if (query && !nodeMatchesSearch(node, query)) return null

  const selected = selectedComponentIds.includes(node.componentId)
  const hovered = hoveredComponentId === node.componentId
  const hidden = hiddenComponentIds.has(node.componentId)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs cursor-pointer ${
          selected ? 'bg-blue-600/30 text-[var(--text)]' : hovered ? 'bg-white/5' : 'text-[var(--text-dim)]'
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onMouseEnter={() => setHover(node.componentId)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => selectComponent(node.componentId, e.shiftKey || e.metaKey || e.ctrlKey)}
      >
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {hasChildren && <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={11} />}
        </button>
        <Icon name={node.isMesh ? 'mesh' : 'group'} size={12} className="shrink-0 text-[var(--text-faint)]" />
        <span className="flex-1 truncate">{node.name}</span>
        <button
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            toggleVisibility(node.componentId)
          }}
        >
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={12} />
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeRow key={child.componentId} node={child} depth={depth + 1} query={query} />
          ))}
        </div>
      )}
    </div>
  )
}

function SelectionAssignment() {
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const materialAssignments = useAppStore((s) => s.materialAssignments)
  const assignMaterialToComponents = useAppStore((s) => s.assignMaterialToComponents)
  const [pending, setPending] = useState<string | null | undefined>(undefined)

  if (selectedComponentIds.length === 0) return null

  const currentAssignment =
    selectedComponentIds.length === 1 ? materialAssignments[selectedComponentIds[0]] ?? null : null
  const effective = pending !== undefined ? pending : currentAssignment

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-1.5 text-[11px] font-medium text-[var(--text)]">
        Assign material to {selectedComponentIds.length} selected object{selectedComponentIds.length > 1 ? 's' : ''}
      </div>
      <div className="flex gap-1.5">
        <MaterialPicker value={effective} onChange={setPending} className="flex-1" />
        <button
          className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
          onClick={() => void assignMaterialToComponents(effective, selectedComponentIds)}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

function FaceSelectionAssignment() {
  const faceSelectComponentId = useAppStore((s) => s.faceSelectComponentId)
  const faceSelectedFaceIndices = useAppStore((s) => s.faceSelectedFaceIndices)
  const faceMaterialAssignments = useAppStore((s) => s.faceMaterialAssignments)
  const objectMeta = useAppStore((s) => s.objectMeta)
  const assignMaterialToFaceSelection = useAppStore((s) => s.assignMaterialToFaceSelection)
  const clearFaceSelection = useAppStore((s) => s.clearFaceSelection)
  const [pending, setPending] = useState<string | null | undefined>(undefined)

  if (!faceSelectComponentId || faceSelectedFaceIndices.size === 0) return null

  const objectName = objectMeta.get(faceSelectComponentId)?.name ?? faceSelectComponentId
  const overridesForObject = faceMaterialAssignments[faceSelectComponentId]
  const selectedIds = Array.from(faceSelectedFaceIndices)
  // Only pre-fill the picker with the current assignment when every selected face already
  // shares the exact same override — otherwise leave it blank rather than implying one.
  const uniformAssignment = overridesForObject
    ? selectedIds.every((f) => overridesForObject[f] === overridesForObject[selectedIds[0]])
      ? overridesForObject[selectedIds[0]] ?? null
      : null
    : null
  const effective = pending !== undefined ? pending : uniformAssignment

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: 'var(--panel-border)' }} data-testid="face-selection-assignment">
      <div className="mb-1.5 text-[11px] font-medium text-[var(--text)]">
        SELECTED: {faceSelectedFaceIndices.size} face{faceSelectedFaceIndices.size > 1 ? 's' : ''} on &quot;{objectName}&quot;
      </div>
      <div className="mb-1.5 flex gap-1.5">
        <MaterialPicker value={effective} onChange={setPending} className="flex-1" />
        <button
          className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
          onClick={() => void assignMaterialToFaceSelection(effective)}
        >
          Apply
        </button>
      </div>
      <div className="flex gap-1.5">
        <button
          className="flex-1 rounded bg-[#2a2c33] px-2 py-1 text-[11px] text-[var(--text)] hover:bg-[#33353d]"
          onClick={() => void assignMaterialToFaceSelection(null)}
        >
          Reset to base material
        </button>
        <button
          className="rounded bg-[#2a2c33] px-2 py-1 text-[11px] text-[var(--text-dim)] hover:bg-[#33353d]"
          onClick={clearFaceSelection}
        >
          Clear selection
        </button>
      </div>
    </div>
  )
}

function FbxMaterialsSection() {
  const fbxMaterialNames = useAppStore((s) => s.fbxMaterialNames)
  const assignMaterialToFbxMaterialName = useAppStore((s) => s.assignMaterialToFbxMaterialName)
  const [choices, setChoices] = useState<Record<string, string | null>>({})

  if (fbxMaterialNames.length === 0) return null

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-1.5 text-[11px] font-medium text-[var(--text)]">Imported FBX materials</div>
      <div className="space-y-1.5">
        {fbxMaterialNames.map((name) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 truncate text-[11px] text-[var(--text-dim)]" title={name}>
              {name}
            </span>
            <MaterialPicker
              value={choices[name] ?? null}
              onChange={(v) => setChoices((c) => ({ ...c, [name]: v }))}
              className="flex-1"
            />
            <button
              title="Apply to all objects using this FBX material"
              className="rounded bg-[#2a2c33] px-1.5 py-1 text-[11px] text-[var(--text)] hover:bg-[#33353d]"
              onClick={() => void assignMaterialToFbxMaterialName(choices[name] ?? null, name)}
            >
              <Icon name="check" size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ObjectTreePanel() {
  const objectTree = useAppStore((s) => s.objectTree)
  const fbxFileName = useAppStore((s) => s.fbxFileName)
  const setActiveRightPanel = useAppStore((s) => s.setActiveRightPanel)
  const count = useAppStore((s) => s.objectMeta.size)
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()

  return (
    <PanelShell title={`Object Tree${fbxFileName ? ` — ${count}` : ''}`} onClose={() => setActiveRightPanel(null)}>
      {!objectTree ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[var(--text-faint)]">
          <Icon name="import" size={22} />
          No model imported yet. Use Import FBX in the top bar.
        </div>
      ) : (
        <>
          <div className="border-b px-2 py-2" style={{ borderColor: 'var(--panel-border)' }}>
            <div className="flex items-center gap-1.5 rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1">
              <Icon name="search" size={12} className="text-[var(--text-faint)]" />
              <input
                className="w-full bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                placeholder="Search objects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[45vh] overflow-y-auto px-1 py-1">
            <TreeRow node={objectTree} depth={0} query={query} />
          </div>
          <SelectionAssignment />
          <FaceSelectionAssignment />
          <FbxMaterialsSection />
        </>
      )}
    </PanelShell>
  )
}
