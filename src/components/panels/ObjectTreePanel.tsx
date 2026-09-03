import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { ObjectTreeNode } from '../../types/tree'
import type { TreeFolder } from '../../types/folder'
import { collectFolderComponentIds, getBuildStageFolders } from '../../types/folder'
import { EMPTY_PRODUCT_INFO, looksLikeEmail, looksLikeUrl, type ProductInfo } from '../../types/product'
import { Icon } from '../common/Icon'
import { PanelShell } from './PanelShell'
import { MaterialPicker } from './MaterialPicker'
import { PromptDialog } from '../common/PromptDialog'

/** Drag payload carried in the HTML5 DnD `application/json` slot. */
type DragPayload = { kind: 'components'; ids: string[] } | { kind: 'folder'; id: string }

function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData('application/json')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DragPayload
    if (parsed.kind === 'components' && Array.isArray(parsed.ids)) return parsed
    if (parsed.kind === 'folder' && typeof parsed.id === 'string') return parsed
    return null
  } catch {
    return null
  }
}

function useNodeMap(root: ObjectTreeNode | null): Map<string, ObjectTreeNode> {
  return useMemo(() => {
    const map = new Map<string, ObjectTreeNode>()
    if (!root) return map
    const walk = (n: ObjectTreeNode) => {
      map.set(n.componentId, n)
      n.children.forEach(walk)
    }
    walk(root)
    return map
  }, [root])
}

function nodeMatchesSearch(node: ObjectTreeNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true
  return node.children.some((c) => nodeMatchesSearch(c, query))
}

function folderMatchesSearch(
  folderId: string,
  folders: Record<string, TreeFolder>,
  folderMembership: Record<string, string>,
  nodeMap: Map<string, ObjectTreeNode>,
  query: string,
): boolean {
  const folder = folders[folderId]
  if (folder && folder.name.toLowerCase().includes(query)) return true
  for (const [componentId, fid] of Object.entries(folderMembership)) {
    if (fid !== folderId) continue
    const node = nodeMap.get(componentId)
    if (node && nodeMatchesSearch(node, query)) return true
  }
  for (const f of Object.values(folders)) {
    if (f.parentId === folderId && folderMatchesSearch(f.id, folders, folderMembership, nodeMap, query)) return true
  }
  return false
}

function TreeRow({ node, depth, query }: { node: ObjectTreeNode; depth: number; query: string }) {
  const [expanded, setExpanded] = useState(true)
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const hoveredComponentId = useAppStore((s) => s.hoveredComponentId)
  const hiddenComponentIds = useAppStore((s) => s.hiddenComponentIds)
  const folderMembership = useAppStore((s) => s.folderMembership)
  const hasProductInfo = useAppStore((s) => !!s.productInfo[node.componentId])
  const selectComponent = useAppStore((s) => s.selectComponent)
  const setHover = useAppStore((s) => s.setHover)
  const toggleVisibility = useAppStore((s) => s.toggleVisibility)

  if (query && !nodeMatchesSearch(node, query)) return null

  const selected = selectedComponentIds.includes(node.componentId)
  const hovered = hoveredComponentId === node.componentId
  const hidden = hiddenComponentIds.has(node.componentId)
  // Children that have been grouped into a folder render there instead of at their original
  // tree position — everything else (including any un-grouped children of a grouped node)
  // renders normally, wherever that node ends up.
  const visibleChildren = node.children.filter((c) => !folderMembership[c.componentId])
  const hasChildren = visibleChildren.length > 0
  const isExpanded = query ? true : expanded

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          const ids =
            selectedComponentIds.includes(node.componentId) && selectedComponentIds.length > 1
              ? selectedComponentIds
              : [node.componentId]
          e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'components', ids } satisfies DragPayload))
          e.dataTransfer.effectAllowed = 'move'
        }}
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
          {hasChildren && <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={11} />}
        </button>
        <Icon name={node.isMesh ? 'mesh' : 'group'} size={12} className="shrink-0 text-[var(--text-faint)]" />
        <span className="flex-1 truncate">{node.name}</span>
        {hasProductInfo && (
          <span
            title="Has product information"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
          />
        )}
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
      {isExpanded && hasChildren && (
        <div>
          {visibleChildren.map((child) => (
            <TreeRow key={child.componentId} node={child} depth={depth + 1} query={query} />
          ))}
        </div>
      )}
    </div>
  )
}

function FolderRow({ folder, depth, query }: { folder: TreeFolder; depth: number; query: string }) {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const folders = useAppStore((s) => s.folders)
  const folderMembership = useAppStore((s) => s.folderMembership)
  const objectTree = useAppStore((s) => s.objectTree)
  const hiddenComponentIds = useAppStore((s) => s.hiddenComponentIds)
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const selectFolderContents = useAppStore((s) => s.selectFolderContents)
  const toggleFolderVisibility = useAppStore((s) => s.toggleFolderVisibility)
  const renameFolder = useAppStore((s) => s.renameFolder)
  const deleteFolder = useAppStore((s) => s.deleteFolder)
  const moveComponentsToFolder = useAppStore((s) => s.moveComponentsToFolder)
  const moveFolderToFolder = useAppStore((s) => s.moveFolderToFolder)
  const setFolderBuildStage = useAppStore((s) => s.setFolderBuildStage)

  const nodeMap = useNodeMap(objectTree)

  if (query && !folderMatchesSearch(folder.id, folders, folderMembership, nodeMap, query)) return null

  const isExpanded = query ? true : expanded
  const childFolders = Object.values(folders).filter((f) => f.parentId === folder.id)
  const memberNodes = Object.entries(folderMembership)
    .filter(([, fid]) => fid === folder.id)
    .map(([cid]) => nodeMap.get(cid))
    .filter((n): n is ObjectTreeNode => !!n)
  const hasChildren = childFolders.length > 0 || memberNodes.length > 0

  const allComponentIds = collectFolderComponentIds(folders, folderMembership, folder.id)
  const hidden = allComponentIds.length > 0 && allComponentIds.every((id) => hiddenComponentIds.has(id))
  const selected = allComponentIds.length > 0 && allComponentIds.every((id) => selectedComponentIds.includes(id))
  const isBuildStage = folder.buildStageOrder !== undefined

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const payload = readDragPayload(e)
    if (!payload) return
    if (payload.kind === 'components') moveComponentsToFolder(payload.ids, folder.id)
    else if (payload.id !== folder.id) moveFolderToFolder(payload.id, folder.id)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'folder', id: folder.id } satisfies DragPayload))
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs cursor-pointer ${
          selected ? 'bg-blue-600/30 text-[var(--text)]' : dragOver ? 'bg-blue-500/20' : 'text-[var(--text-dim)]'
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={(e) => selectFolderContents(folder.id, e.shiftKey || e.metaKey || e.ctrlKey)}
      >
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {hasChildren && <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={11} />}
        </button>
        <Icon name="folder" size={12} className="shrink-0 text-amber-400" />
        <span className="flex-1 truncate font-medium text-[var(--text)]">{folder.name}</span>
        {isBuildStage && (
          <span
            title={`Build stage ${folder.buildStageOrder}`}
            className="shrink-0 rounded bg-emerald-600/30 px-1 py-0.5 text-[9px] font-semibold text-emerald-300"
          >
            Stage {folder.buildStageOrder}
          </span>
        )}
        <button
          title={isBuildStage ? 'Unmark as build stage' : 'Mark as build stage'}
          className={`shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 ${isBuildStage ? 'text-emerald-400 opacity-100' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setFolderBuildStage(folder.id, !isBuildStage)
          }}
        >
          <Icon name="flag" size={11} />
        </button>
        <button
          title="Rename folder"
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            setRenaming(true)
          }}
        >
          <Icon name="edit" size={11} />
        </button>
        <button
          title="Ungroup (keeps objects, deletes only the folder)"
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            deleteFolder(folder.id)
          }}
        >
          <Icon name="trash" size={11} />
        </button>
        <button
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            toggleFolderVisibility(folder.id)
          }}
        >
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={12} />
        </button>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {childFolders.map((f) => (
            <FolderRow key={f.id} folder={f} depth={depth + 1} query={query} />
          ))}
          {memberNodes.map((n) => (
            <TreeRow key={n.componentId} node={n} depth={depth + 1} query={query} />
          ))}
        </div>
      )}
      {renaming && (
        <PromptDialog
          title="Rename Folder"
          initialValue={folder.name}
          confirmLabel="RENAME"
          onCancel={() => setRenaming(false)}
          onConfirm={(name) => {
            renameFolder(folder.id, name)
            setRenaming(false)
          }}
        />
      )}
    </div>
  )
}

function SelectionAssignment() {
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  const materialAssignments = useAppStore((s) => s.materialAssignments)
  const assignMaterialToComponents = useAppStore((s) => s.assignMaterialToComponents)
  const createFolderFromSelection = useAppStore((s) => s.createFolderFromSelection)
  const [pending, setPending] = useState<string | null | undefined>(undefined)
  const [creatingFolder, setCreatingFolder] = useState(false)

  if (selectedComponentIds.length === 0) return null

  const currentAssignment =
    selectedComponentIds.length === 1 ? materialAssignments[selectedComponentIds[0]] ?? null : null
  const effective = pending !== undefined ? pending : currentAssignment

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-[var(--text)]">
          {selectedComponentIds.length} selected object{selectedComponentIds.length > 1 ? 's' : ''}
        </div>
        <button
          className="shrink-0 rounded bg-[#2a2c33] px-1.5 py-1 text-[11px] text-[var(--text)] hover:bg-[#33353d]"
          onClick={() => setCreatingFolder(true)}
        >
          <span className="inline-flex items-center gap-1">
            <Icon name="folder" size={11} />
            New Folder from Selection
          </span>
        </button>
      </div>
      <div className="mb-1.5 text-[11px] text-[var(--text-dim)]">
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
      {creatingFolder && (
        <PromptDialog
          title="New Folder"
          label={`Group ${selectedComponentIds.length} selected object${selectedComponentIds.length > 1 ? 's' : ''} into a folder.`}
          confirmLabel="CREATE"
          onCancel={() => setCreatingFolder(false)}
          onConfirm={(name) => {
            createFolderFromSelection(name, selectedComponentIds)
            setCreatingFolder(false)
          }}
        />
      )}
    </div>
  )
}

const productInputClass =
  'w-full rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-blue-500'

function ProductInfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium text-[var(--text-dim)]">{label}</span>
      {children}
    </label>
  )
}

/** Keyed by componentId from ProductInfoSection so switching the selected object remounts this
 * with fresh draft state — simpler and less error-prone than a useEffect re-sync. Edits are
 * local (draft) until Save is clicked, matching how material edits require an explicit save. */
function ProductInfoFields({ componentId }: { componentId: string }) {
  const objectMeta = useAppStore((s) => s.objectMeta)
  const storedInfo = useAppStore((s) => s.productInfo[componentId])
  const setProductInfo = useAppStore((s) => s.setProductInfo)
  const [draft, setDraft] = useState<ProductInfo>(() => storedInfo ?? EMPTY_PRODUCT_INFO)
  const [justSaved, setJustSaved] = useState(false)

  const objectName = objectMeta.get(componentId)?.name ?? componentId

  function update<K extends keyof ProductInfo>(key: K, value: ProductInfo[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setJustSaved(false)
  }

  return (
    <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-1.5 text-[11px] font-medium text-[var(--text)]">Product Information — &quot;{objectName}&quot;</div>
      <div className="space-y-2">
        <ProductInfoField label="Description">
          <textarea
            className={`${productInputClass} h-16 resize-none`}
            value={draft.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </ProductInfoField>
        <ProductInfoField label="Installation Manual URL">
          <input
            className={productInputClass}
            placeholder="https://…"
            value={draft.installationManualUrl}
            onChange={(e) => update('installationManualUrl', e.target.value)}
          />
          {!looksLikeUrl(draft.installationManualUrl) && (
            <p className="mt-0.5 text-[10px] text-amber-400">Doesn&apos;t look like a full URL (missing http(s)://)</p>
          )}
        </ProductInfoField>
        <ProductInfoField label="Product Page URL">
          <input
            className={productInputClass}
            placeholder="https://…"
            value={draft.productPageUrl}
            onChange={(e) => update('productPageUrl', e.target.value)}
          />
          {!looksLikeUrl(draft.productPageUrl) && (
            <p className="mt-0.5 text-[10px] text-amber-400">Doesn&apos;t look like a full URL (missing http(s)://)</p>
          )}
        </ProductInfoField>

        <div className="border-t pt-2" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            Supplier Contact
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ProductInfoField label="Supplier / Company">
              <input className={productInputClass} value={draft.supplierName} onChange={(e) => update('supplierName', e.target.value)} />
            </ProductInfoField>
            <ProductInfoField label="Contact Name (optional)">
              <input className={productInputClass} value={draft.contactName} onChange={(e) => update('contactName', e.target.value)} />
            </ProductInfoField>
            <ProductInfoField label="Phone">
              <input className={productInputClass} value={draft.phone} onChange={(e) => update('phone', e.target.value)} />
            </ProductInfoField>
            <ProductInfoField label="Email">
              <input
                className={productInputClass}
                placeholder="name@example.com"
                value={draft.email}
                onChange={(e) => update('email', e.target.value)}
              />
              {!looksLikeEmail(draft.email) && <p className="mt-0.5 text-[10px] text-amber-400">Doesn&apos;t look like an email address</p>}
            </ProductInfoField>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500"
          onClick={() => {
            setProductInfo(componentId, draft)
            setJustSaved(true)
          }}
        >
          Save Product Information
        </button>
        {justSaved && <span className="text-[10px] text-emerald-400">Saved</span>}
      </div>
    </div>
  )
}

function ProductInfoSection() {
  const selectedComponentIds = useAppStore((s) => s.selectedComponentIds)
  if (selectedComponentIds.length !== 1) return null
  return <ProductInfoFields key={selectedComponentIds[0]} componentId={selectedComponentIds[0]} />
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

/** Lists every build-stage folder in order, with up/down reorder controls, and a simple
 * prev/next stepper that isolates each stage in turn by reusing the existing isolate path
 * (isolateFolder -> selectFolderContents + isolateSelected) — no separate visibility system. */
function BuildStagesSection() {
  const folders = useAppStore((s) => s.folders)
  const isolateFolder = useAppStore((s) => s.isolateFolder)
  const exitIsolate = useAppStore((s) => s.exitIsolate)
  const moveBuildStageOrder = useAppStore((s) => s.moveBuildStageOrder)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const stages = getBuildStageFolders(folders)
  if (stages.length === 0) return null

  // Defensive: stages can be reordered/deleted out from under a stale index (e.g. mid-preview).
  const safeIndex = activeIndex !== null && activeIndex < stages.length ? activeIndex : null

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(stages.length - 1, index))
    setActiveIndex(clamped)
    isolateFolder(stages[clamped].id)
  }

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--text)]">Build Stages ({stages.length})</span>
        {safeIndex !== null && (
          <button
            className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]"
            onClick={() => {
              setActiveIndex(null)
              exitIsolate()
            }}
          >
            Exit preview
          </button>
        )}
      </div>

      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          className="shrink-0 rounded bg-[#2a2c33] p-1 disabled:opacity-30"
          disabled={safeIndex !== null && safeIndex <= 0}
          onClick={() => goTo((safeIndex ?? 0) - 1)}
        >
          <Icon name="chevronRight" size={12} className="rotate-180" />
        </button>
        <span className="flex-1 truncate text-center text-[11px] text-[var(--text-dim)]">
          {safeIndex === null ? 'Preview steps through stages in order' : `Stage ${safeIndex + 1} of ${stages.length}: ${stages[safeIndex].name}`}
        </span>
        <button
          className="shrink-0 rounded bg-[#2a2c33] p-1 disabled:opacity-30"
          disabled={safeIndex !== null && safeIndex >= stages.length - 1}
          onClick={() => goTo((safeIndex ?? -1) + 1)}
        >
          <Icon name="chevronRight" size={12} />
        </button>
      </div>

      <div className="space-y-1">
        {stages.map((stage, i) => (
          <div
            key={stage.id}
            className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${safeIndex === i ? 'bg-blue-600/20' : ''}`}
          >
            <span className="w-4 shrink-0 text-center text-[var(--text-faint)]">{stage.buildStageOrder}</span>
            <span className="flex-1 truncate text-[var(--text)]">{stage.name}</span>
            <button
              title="Move earlier"
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 disabled:opacity-20"
              disabled={i === 0}
              onClick={() => moveBuildStageOrder(stage.id, 'up')}
            >
              <Icon name="chevronRight" size={10} className="-rotate-90" />
            </button>
            <button
              title="Move later"
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 disabled:opacity-20"
              disabled={i === stages.length - 1}
              onClick={() => moveBuildStageOrder(stage.id, 'down')}
            >
              <Icon name="chevronRight" size={10} className="rotate-90" />
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
  const folders = useAppStore((s) => s.folders)
  const moveComponentsToFolder = useAppStore((s) => s.moveComponentsToFolder)
  const moveFolderToFolder = useAppStore((s) => s.moveFolderToFolder)
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const rootFolders = Object.values(folders).filter((f) => f.parentId === null)

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault()
    const payload = readDragPayload(e)
    if (!payload) return
    if (payload.kind === 'components') moveComponentsToFolder(payload.ids, null)
    else moveFolderToFolder(payload.id, null)
  }

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
          <div
            className="max-h-[45vh] overflow-y-auto px-1 py-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleRootDrop}
          >
            {rootFolders.map((f) => (
              <FolderRow key={f.id} folder={f} depth={0} query={query} />
            ))}
            <TreeRow node={objectTree} depth={0} query={query} />
          </div>
          <BuildStagesSection />
          <SelectionAssignment />
          <ProductInfoSection />
          <FaceSelectionAssignment />
          <FbxMaterialsSection />
        </>
      )}
    </PanelShell>
  )
}
