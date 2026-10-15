import { create } from 'zustand'
import * as THREE from 'three'
import type { ObjectMeta, EdgeSettings, ExportSettings } from '../types/scene'
import { DEFAULT_EDGE_SETTINGS, DEFAULT_EXPORT_SETTINGS, clampEdgeSettings, isAuxiliaryMesh } from '../types/scene'
import { renameNodeInTree, renameNodesInTree, type ObjectTreeNode } from '../types/tree'
import type { TreeFolder } from '../types/folder'
import { collectFolderComponentIds, getBuildStageFolders } from '../types/folder'
import type { SunSettings } from '../types/sun'
import { DEFAULT_SUN_SETTINGS } from '../types/sun'
import type { ProductInfo } from '../types/product'
import { isProductInfoEmpty } from '../types/product'
import type { HistorySnapshot } from '../types/history'
import { importFbx } from '../three/fbxImport'
import { storeAssetFile } from '../db/assetCache'
import { SceneManager, type ProjectionMode } from '../three/SceneManager'
import { EdgePreviewController } from '../three/edges/fatLineEdges'
import { buildThreeMaterial } from '../three/materialFactory'
import { getCanonicalGeometry, getFaceCount, rebuildMeshFaceMaterials, restoreCanonicalGeometry } from '../three/faceMaterials'
import { useMaterialLibraryStore } from './useMaterialLibraryStore'
import { makeId } from '../utils/id'

export type ActiveTool = 'select' | 'orbit' | 'pan' | 'zoom' | 'measure' | 'faceSelect' | 'edgeSelect'
export type RightPanelKey = 'objectTree' | 'materials' | 'materialEditor' | 'edgeSettings' | 'sun' | null

/** componentId -> canonical face index -> assigned custom material id. Serializable as-is for
 * project save/restore. */
export type FaceMaterialAssignments = Record<string, Record<number, string>>

interface AppState {
  sceneManager: SceneManager | null
  edgePreview: EdgePreviewController | null

  // Model / import
  modelRoot: THREE.Group | null
  objectTree: ObjectTreeNode | null
  objectMeta: Map<string, ObjectMeta>
  fbxMaterialNames: string[]
  fbxFileName: string | null
  /** The imported FBX's own bytes, cached as a blob asset (see db/assetCache.ts) so a
   * self-contained "Save to File" project export can bundle the source model itself, not just a
   * reference to its name — see src/utils/projectFile.ts. Null until an FBX has been imported. */
  fbxAssetId: string | null
  importing: boolean
  importError: string | null

  // Assignment
  materialAssignments: Record<string, string>
  applyingMaterials: boolean

  // Product information — per-component metadata, independent of materials/edges/geometry.
  // See src/types/product.ts. componentId -> ProductInfo (only entries with at least one
  // non-empty field are kept, so "has product info" is a plain key-presence check).
  productInfo: Record<string, ProductInfo>

  // Face-level assignment
  faceMaterialAssignments: FaceMaterialAssignments
  faceSelectComponentId: string | null
  faceSelectedFaceIndices: Set<number>

  // Visibility / isolation
  hiddenComponentIds: Set<string>
  isolateActive: boolean

  // Object Tree folder grouping — organizational only, never touches the scene graph, the
  // FBX-derived hierarchy, or GLB export. See src/types/folder.ts.
  folders: Record<string, TreeFolder>
  /** componentId -> id of the folder directly containing it (only for objects the user has
   * explicitly grouped; everything else renders at its original tree position). */
  folderMembership: Record<string, string>

  // Selection
  selectedComponentIds: string[]
  /** The last componentId passed to selectComponent (set on both plain and additive clicks) —
   * the anchor a shift-click range-select measures from in the Object Tree. */
  lastSelectedComponentId: string | null
  hoveredComponentId: string | null

  // Viewport / tools
  activeTool: ActiveTool
  wireframe: boolean
  projection: ProjectionMode
  gridVisible: boolean
  axesVisible: boolean

  // Edge system
  edgeSettings: EdgeSettings
  /** Components whose edges are hidden entirely — in the live preview and at GLB export.
   * componentId-scoped like hiddenComponentIds, but tracked separately: hiding a component's
   * edges never touches its geometry/material visibility and vice versa. */
  hiddenEdgeComponentIds: Set<string>
  /** Individual edge segments hidden within an otherwise-visible component, keyed by componentId
   * (see edgeGeneration.ts's edgeSegmentKey for how a segment's key is derived). */
  hiddenEdgeKeys: Record<string, Set<string>>

  // Sun (viewport-only lighting/shadow preview — see src/types/sun.ts)
  sunSettings: SunSettings

  // Export
  exportSettings: ExportSettings

  // UI
  activeRightPanel: RightPanelKey
  editingMaterialId: string | null
  statusMessage: string

  // Undo/redo — see src/types/history.ts for exactly what's (and isn't) tracked.
  undoStack: HistorySnapshot[]
  redoStack: HistorySnapshot[]

  // Actions
  initSceneManager: (sm: SceneManager) => void
  importFbxFile: (file: File) => Promise<void>

  selectComponent: (componentId: string | null, additive?: boolean) => void
  selectComponentRange: (componentIds: string[]) => void
  setHover: (componentId: string | null) => void
  renameComponent: (componentId: string, name: string) => void
  /** Bulk version of renameComponent — restores every componentId -> name entry a saved project
   * recorded (see AuthoringProject.componentNames), needed because re-importing the source FBX
   * on project open regenerates objectMeta/objectTree straight from the FBX's own object names,
   * which would otherwise silently revert any rename. componentIds absent from `names` are left
   * untouched. */
  applyComponentNames: (names: Record<string, string>) => void

  toggleVisibility: (componentId: string) => void
  isolateSelected: () => void
  exitIsolate: () => void
  showAll: () => void

  createFolderFromSelection: (name: string, componentIds: string[]) => string
  renameFolder: (folderId: string, name: string) => void
  deleteFolder: (folderId: string) => void
  moveComponentsToFolder: (componentIds: string[], folderId: string | null) => void
  /** Moves componentIds into folderId (relabeling them if they belonged elsewhere, or weren't
   * grouped at all) positioned immediately before beforeComponentId within that folder's member
   * list, or at the end when null. Powers drag-to-reorder within a folder/stage in the Object
   * Tree — folderMembership's own key order is what FolderRow renders members in, so this
   * rebuilds the whole record with the target folder's member keys in the new order rather than
   * needing a separate ordering field. */
  reorderComponentsInFolder: (componentIds: string[], folderId: string, beforeComponentId: string | null) => void
  moveFolderToFolder: (folderId: string, parentId: string | null) => void
  toggleFolderVisibility: (folderId: string) => void
  selectFolderContents: (folderId: string, additive?: boolean) => void

  /** Marks/unmarks a folder as a build stage — see src/types/folder.ts. Marking assigns the
   * next free stage order (current max + 1); unmarking clears it. */
  setFolderBuildStage: (folderId: string, isStage: boolean) => void
  /** Swaps this stage's order with its immediate neighbor in stage sequence — the up/down
   * reorder control in the Build Stages list. */
  moveBuildStageOrder: (folderId: string, direction: 'up' | 'down') => void
  /** Selects a folder's contents and isolates them — the stage preview/stepper reuses this
   * exact isolate path rather than any new visibility system. */
  isolateFolder: (folderId: string) => void

  assignMaterialToComponents: (materialId: string | null, componentIds: string[]) => Promise<void>
  assignMaterialToFbxMaterialName: (materialId: string | null, fbxMaterialName: string) => Promise<void>
  reapplyAllAssignments: () => Promise<void>

  setProductInfo: (componentId: string, info: ProductInfo) => void
  /** Applies the same ProductInfo to every given componentId in one batched update (mirrors
   * assignMaterialToComponents' multi-select pattern) — replaces each object's existing product
   * information, if any, with these identical values. */
  setProductInfoForComponents: (componentIds: string[], info: ProductInfo) => void
  /** Re-stamps every stored ProductInfo onto the live model's userData.productInfo — needed
   * because the store's record survives across model re-imports/project loads but the actual
   * THREE objects it targets don't. Mirrors reapplyAllAssignments' role for material data. */
  reapplyProductInfo: () => void

  // Face-level assignment
  selectFace: (componentId: string, faceIndex: number, additive: boolean) => void
  addFacesToSelection: (componentId: string, faceIndices: number[]) => void
  clearFaceSelection: () => void
  assignMaterialToFaceSelection: (materialId: string | null) => Promise<void>

  setActiveTool: (tool: ActiveTool) => void
  setWireframe: (v: boolean) => void
  setProjection: (mode: ProjectionMode) => void
  setGridVisible: (v: boolean) => void
  setAxesVisible: (v: boolean) => void
  fitToScreen: () => void
  resetCamera: () => void

  setEdgeSettings: (partial: Partial<EdgeSettings>) => void
  /** Rebuilds the live edge-preview lines from current edgeSettings + hidden-edge state — the
   * one place that assembles all four rebuild() arguments, called by every action that changes
   * any of them instead of each duplicating the same lookup. */
  rebuildEdgePreview: () => void
  /** Toggles every given componentId's edges entirely on/off (expanded to include all
   * descendant mesh componentIds, so selecting a group hides every mesh's edges underneath it) —
   * the Object Tree's "Hide/Show Component Edges" bulk action for the current selection.
   * Majority-state toggle: if every one is already hidden this shows them, otherwise it hides
   * whichever aren't already. */
  toggleComponentEdgesHidden: (componentIds: string[]) => void
  /** Toggles one individual edge segment (identified by its stable key — see
   * edgeGeneration.ts's edgeSegmentKey) hidden/shown on one component — the Edge Select tool's
   * click-to-hide action. */
  toggleEdgeHidden: (componentId: string, edgeKey: string) => void
  /** Clears every hidden-edge-component and hidden-individual-edge entry — the Component Edge
   * Settings panel's "Show All Hidden Edges" reset. */
  showAllHiddenEdges: () => void
  setSunSettings: (partial: Partial<SunSettings>) => void
  setExportSettings: (partial: Partial<ExportSettings>) => void

  setActiveRightPanel: (panel: RightPanelKey) => void
  openMaterialEditor: (materialId: string | null) => void
  closeMaterialEditor: () => void
  setStatusMessage: (msg: string) => void

  /** Records the current content state onto the undo stack before a content-changing action
   * applies its own change, and clears the redo stack (a fresh edit invalidates whatever was
   * un-done). `kind` coalesces rapid repeats of the *same* kind of edit (a slider drag firing many
   * onChange events, several quick clicks) into a single undo step — see HISTORY_COALESCE_MS. */
  pushHistory: (kind: string) => void
  /** Restores every HistorySnapshot field at once (one `set()` call) and re-runs exactly the side
   * effects those fields normally trigger on their own (reapply materials/product info, rebuild
   * edge preview, reapply sun settings, re-push visibility) — used by both undo and redo. */
  applyHistorySnapshot: (snapshot: HistorySnapshot) => void
  undo: () => void
  redo: () => void
}

function applyVisibility(root: THREE.Object3D, hidden: Set<string>, isolate: Set<string> | null) {
  root.traverse((obj) => {
    const id = obj.userData.componentId as string | undefined
    if (!id) return
    if (isolate) {
      obj.visible = isolate.has(id)
    } else {
      obj.visible = !hidden.has(id)
    }
  })
}

/** Builds the undoable "content" snapshot from the live store state — see HistorySnapshot for
 * exactly what's captured and why. The Record/array-valued fields here are safe to reference
 * directly rather than deep-cloning: every action in this store already replaces them wholesale
 * (spread into a new object/array) rather than mutating in place, so a reference taken now can
 * never be changed out from under a stored snapshot later. */
function getHistorySnapshot(s: AppState): HistorySnapshot {
  return {
    materialAssignments: s.materialAssignments,
    faceMaterialAssignments: s.faceMaterialAssignments,
    productInfo: s.productInfo,
    folders: s.folders,
    folderMembership: s.folderMembership,
    componentNames: Object.fromEntries(Array.from(s.objectMeta.entries()).map(([k, m]) => [k, m.name])),
    hiddenComponentIds: Array.from(s.hiddenComponentIds),
    hiddenEdgeComponentIds: Array.from(s.hiddenEdgeComponentIds),
    hiddenEdgeKeys: Object.fromEntries(Object.entries(s.hiddenEdgeKeys).map(([k, v]) => [k, Array.from(v)])),
    edgeSettings: s.edgeSettings,
    exportSettings: s.exportSettings,
    sunSettings: s.sunSettings,
  }
}

const MAX_HISTORY_ENTRIES = 100
/** A burst of same-kind pushHistory calls within this window (a slider being dragged, several
 * quick successive clicks) collapses into the single undo step that started the burst, rather
 * than one step per intermediate value — so Ctrl+Z undoes "that drag"/"that run of clicks", not
 * one imperceptible increment of it. */
const HISTORY_COALESCE_MS = 600
let lastHistoryPushAt = 0
let lastHistoryKind: string | null = null

/** Every componentId under `selectedIds` — groups and meshes alike, including the selected ids
 * themselves and every descendant's — so a bulk action on a group (e.g. a whole Revit family
 * instance) reaches every mesh underneath it, not just the exact node that was clicked. Mirrors
 * isolateSelected's own ancestor-chain walk. */
function collectComponentIdsIncludingDescendants(modelRoot: THREE.Object3D, selectedIds: string[]): Set<string> {
  const include = new Set<string>()
  modelRoot.traverse((obj) => {
    const id = obj.userData.componentId as string | undefined
    if (!id) return
    let cur: THREE.Object3D | null = obj
    while (cur) {
      const curId = cur.userData.componentId as string | undefined
      if (curId && selectedIds.includes(curId)) {
        include.add(id)
        break
      }
      cur = cur.parent
    }
  })
  return include
}

let isolateSet: Set<string> | null = null

/** True if `folderId` is `maybeAncestorId` itself, or nested inside it — used to reject a
 * folder-into-folder drag that would create a cycle. */
function isFolderOrDescendant(folders: Record<string, TreeFolder>, folderId: string, maybeAncestorId: string): boolean {
  let cur: string | null = folderId
  while (cur) {
    if (cur === maybeAncestorId) return true
    cur = folders[cur]?.parentId ?? null
  }
  return false
}

export const useAppStore = create<AppState>((set, get) => ({
  sceneManager: null,
  edgePreview: null,

  modelRoot: null,
  objectTree: null,
  objectMeta: new Map(),
  fbxMaterialNames: [],
  fbxFileName: null,
  fbxAssetId: null,
  importing: false,
  importError: null,

  materialAssignments: {},
  applyingMaterials: false,

  productInfo: {},

  faceMaterialAssignments: {},
  faceSelectComponentId: null,
  faceSelectedFaceIndices: new Set(),

  hiddenComponentIds: new Set(),
  isolateActive: false,

  folders: {},
  folderMembership: {},

  selectedComponentIds: [],
  lastSelectedComponentId: null,
  hoveredComponentId: null,

  activeTool: 'select',
  wireframe: false,
  projection: 'perspective',
  gridVisible: true,
  axesVisible: true,

  edgeSettings: { ...DEFAULT_EDGE_SETTINGS },
  hiddenEdgeComponentIds: new Set(),
  hiddenEdgeKeys: {},
  sunSettings: { ...DEFAULT_SUN_SETTINGS },
  exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

  activeRightPanel: 'objectTree',
  editingMaterialId: null,
  statusMessage: 'Ready. Import an FBX to begin.',

  undoStack: [],
  redoStack: [],

  initSceneManager: (sm) => {
    const edgePreview = new EdgePreviewController()
    set({ sceneManager: sm, edgePreview })
  },

  importFbxFile: async (file) => {
    set({ importing: true, importError: null, statusMessage: `Importing ${file.name}…` })
    try {
      const result = await importFbx(file)
      const sm = get().sceneManager
      sm?.setModel(result.root)
      const fbxAssetId = await storeAssetFile(file)

      isolateSet = null
      lastHistoryKind = null
      set({
        modelRoot: result.root,
        objectTree: result.tree,
        objectMeta: result.objectMeta,
        fbxMaterialNames: result.fbxMaterialNames,
        fbxFileName: file.name,
        fbxAssetId,
        importing: false,
        materialAssignments: {},
        productInfo: {},
        faceMaterialAssignments: {},
        faceSelectComponentId: null,
        faceSelectedFaceIndices: new Set(),
        hiddenComponentIds: new Set(),
        isolateActive: false,
        folders: {},
        folderMembership: {},
        hiddenEdgeComponentIds: new Set(),
        hiddenEdgeKeys: {},
        selectedComponentIds: [],
        lastSelectedComponentId: null,
        hoveredComponentId: null,
        undoStack: [],
        redoStack: [],
        statusMessage: `Imported ${file.name} — ${result.objectMeta.size} objects, ${result.fbxMaterialNames.length} FBX materials.`,
      })

      sm?.setFaceHighlight(null, [])
      sm?.fitToScreen()
      get().setEdgeSettings({})
      get().setSunSettings({})
      // setEdgeSettings/setSunSettings above each push a history entry; a fresh import has no
      // prior state worth undoing back to, so discard those rather than leaving the stack with
      // one redundant no-op entry at the bottom.
      set({ undoStack: [], redoStack: [] })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown FBX import error'
      set({ importing: false, importError: message, statusMessage: `Import failed: ${message}` })
    }
  },

  selectComponent: (componentId, additive = false) => {
    set((s) => {
      if (componentId === null) return { selectedComponentIds: [] }
      if (additive) {
        const has = s.selectedComponentIds.includes(componentId)
        return {
          selectedComponentIds: has
            ? s.selectedComponentIds.filter((id) => id !== componentId)
            : [...s.selectedComponentIds, componentId],
          lastSelectedComponentId: componentId,
        }
      }
      return { selectedComponentIds: [componentId], lastSelectedComponentId: componentId }
    })
    get().sceneManager?.setSelection(get().selectedComponentIds)
  },

  /** Sets the selection to exactly this set of componentIds — used for a shift-click range
   * select in the Object Tree, which computes the range itself (it's the one place that knows
   * the tree's currently rendered top-to-bottom row order) and just needs the result applied. */
  selectComponentRange: (componentIds) => {
    set({ selectedComponentIds: componentIds })
    get().sceneManager?.setSelection(componentIds)
  },

  setHover: (componentId) => {
    set({ hoveredComponentId: componentId })
    get().sceneManager?.setHover(componentId)
  },

  renameComponent: (componentId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    get().pushHistory('renameComponent')
    set((s) => {
      const meta = s.objectMeta.get(componentId)
      if (!meta) return {}
      const objectMeta = new Map(s.objectMeta)
      objectMeta.set(componentId, { ...meta, name: trimmed })
      return {
        objectMeta,
        objectTree: s.objectTree ? renameNodeInTree(s.objectTree, componentId, trimmed) : s.objectTree,
      }
    })
    // Keeps the live THREE.Object3D's own name in sync too — GLTFExporter names glTF nodes
    // straight from Object3D.name, and exportGlb.ts's build-stage summary reads it as well.
    const { modelRoot } = get()
    modelRoot?.traverse((obj) => {
      if (obj.userData.componentId === componentId) obj.name = trimmed
    })
  },

  applyComponentNames: (names) => {
    if (Object.keys(names).length === 0) return
    set((s) => {
      const objectMeta = new Map(s.objectMeta)
      for (const [componentId, name] of Object.entries(names)) {
        const meta = objectMeta.get(componentId)
        if (meta && meta.name !== name) objectMeta.set(componentId, { ...meta, name })
      }
      return {
        objectMeta,
        objectTree: s.objectTree ? renameNodesInTree(s.objectTree, names) : s.objectTree,
      }
    })
    const { modelRoot } = get()
    modelRoot?.traverse((obj) => {
      const componentId = obj.userData.componentId as string | undefined
      const name = componentId ? names[componentId] : undefined
      if (name !== undefined) obj.name = name
    })
  },

  toggleVisibility: (componentId) => {
    get().pushHistory('visibility')
    set((s) => {
      const next = new Set(s.hiddenComponentIds)
      if (next.has(componentId)) next.delete(componentId)
      else next.add(componentId)
      return { hiddenComponentIds: next }
    })
    const { modelRoot, hiddenComponentIds, isolateActive } = get()
    if (modelRoot) applyVisibility(modelRoot, hiddenComponentIds, isolateActive ? isolateSet : null)
  },

  isolateSelected: () => {
    const { modelRoot, selectedComponentIds } = get()
    if (!modelRoot || selectedComponentIds.length === 0) return
    const include = new Set<string>()
    // Include selected components plus all their descendants so isolate reads as "show me
    // this component's part of the tree", not just the exact clicked node.
    modelRoot.traverse((obj) => {
      const id = obj.userData.componentId as string | undefined
      if (!id) return
      let cur: THREE.Object3D | null = obj
      while (cur) {
        const curId = cur.userData.componentId as string | undefined
        if (curId && selectedComponentIds.includes(curId)) {
          include.add(id)
          break
        }
        cur = cur.parent
      }
    })
    isolateSet = include
    set({ isolateActive: true })
    applyVisibility(modelRoot, get().hiddenComponentIds, isolateSet)
  },

  exitIsolate: () => {
    isolateSet = null
    set({ isolateActive: false })
    const { modelRoot, hiddenComponentIds } = get()
    if (modelRoot) applyVisibility(modelRoot, hiddenComponentIds, null)
  },

  showAll: () => {
    get().pushHistory('visibility')
    isolateSet = null
    set({ hiddenComponentIds: new Set(), isolateActive: false })
    const { modelRoot } = get()
    if (modelRoot) applyVisibility(modelRoot, new Set(), null)
  },

  createFolderFromSelection: (name, componentIds) => {
    get().pushHistory('folder')
    const id = makeId('folder')
    set((s) => {
      const membership = { ...s.folderMembership }
      for (const cid of componentIds) membership[cid] = id
      return {
        folders: { ...s.folders, [id]: { id, name, parentId: null } },
        folderMembership: membership,
      }
    })
    return id
  },

  renameFolder: (folderId, name) => {
    get().pushHistory('renameFolder')
    set((s) => {
      const folder = s.folders[folderId]
      if (!folder) return {}
      return { folders: { ...s.folders, [folderId]: { ...folder, name } } }
    })
  },

  deleteFolder: (folderId) => {
    get().pushHistory('folder')
    // Ungroup: contents (subfolders and objects alike) move up to the deleted folder's own
    // parent level — a top-level folder's contents return to the tree at their original
    // position. The underlying objects/subfolders themselves are never deleted.
    set((s) => {
      const folder = s.folders[folderId]
      if (!folder) return {}
      const parentId = folder.parentId

      const folders = { ...s.folders }
      delete folders[folderId]
      for (const f of Object.values(folders)) {
        if (f.parentId === folderId) folders[f.id] = { ...f, parentId }
      }

      const folderMembership = { ...s.folderMembership }
      for (const [cid, fid] of Object.entries(folderMembership)) {
        if (fid !== folderId) continue
        if (parentId) folderMembership[cid] = parentId
        else delete folderMembership[cid]
      }

      return { folders, folderMembership }
    })
  },

  moveComponentsToFolder: (componentIds, folderId) => {
    get().pushHistory('folder')
    set((s) => {
      const membership = { ...s.folderMembership }
      for (const cid of componentIds) {
        if (folderId) membership[cid] = folderId
        else delete membership[cid]
      }
      return { folderMembership: membership }
    })
  },

  reorderComponentsInFolder: (componentIds, folderId, beforeComponentId) => {
    if (componentIds.length === 0) return
    get().pushHistory('folder')
    set((s) => {
      const draggedSet = new Set(componentIds)
      if (beforeComponentId && draggedSet.has(beforeComponentId)) return {} // dropped onto itself/its own group

      const relabeled = { ...s.folderMembership }
      for (const id of componentIds) relabeled[id] = folderId

      // Object.entries preserves key insertion order, which is exactly the order FolderRow
      // renders memberNodes in — so "reordering" means rebuilding this record with the target
      // folder's member keys re-inserted in the new order, not tracking a separate index.
      const entries = Object.entries(relabeled)
      const folderMembers = entries.filter(([, fid]) => fid === folderId)
      const remaining = folderMembers.filter(([cid]) => !draggedSet.has(cid))
      const draggedEntries: [string, string][] = componentIds.map((id) => [id, folderId])

      let insertAt = beforeComponentId ? remaining.findIndex(([cid]) => cid === beforeComponentId) : remaining.length
      if (insertAt === -1) insertAt = remaining.length
      const newFolderOrder = [...remaining.slice(0, insertAt), ...draggedEntries, ...remaining.slice(insertAt)]

      const result: [string, string][] = []
      let spliced = false
      for (const entry of entries) {
        if (entry[1] !== folderId) {
          result.push(entry)
        } else if (!spliced) {
          result.push(...newFolderOrder)
          spliced = true
        }
      }
      return { folderMembership: Object.fromEntries(result) }
    })
  },

  moveFolderToFolder: (folderId, parentId) => {
    get().pushHistory('folder')
    set((s) => {
      const folder = s.folders[folderId]
      if (!folder) return {}
      if (folderId === parentId) return {}
      // Reject a drop that would nest a folder inside its own descendant (or itself).
      if (parentId && isFolderOrDescendant(s.folders, parentId, folderId)) return {}
      return { folders: { ...s.folders, [folderId]: { ...folder, parentId } } }
    })
  },

  toggleFolderVisibility: (folderId) => {
    const { folders, folderMembership, hiddenComponentIds } = get()
    const ids = collectFolderComponentIds(folders, folderMembership, folderId)
    if (ids.length === 0) return
    get().pushHistory('visibility')
    const allHidden = ids.every((id) => hiddenComponentIds.has(id))
    set((s) => {
      const next = new Set(s.hiddenComponentIds)
      for (const id of ids) {
        if (allHidden) next.delete(id)
        else next.add(id)
      }
      return { hiddenComponentIds: next }
    })
    const { modelRoot, isolateActive } = get()
    if (modelRoot) applyVisibility(modelRoot, get().hiddenComponentIds, isolateActive ? isolateSet : null)
  },

  selectFolderContents: (folderId, additive = false) => {
    const { folders, folderMembership } = get()
    const ids = collectFolderComponentIds(folders, folderMembership, folderId)
    set((s) => {
      if (!additive) return { selectedComponentIds: ids }
      const nextSet = new Set(s.selectedComponentIds)
      const allSelected = ids.length > 0 && ids.every((id) => nextSet.has(id))
      if (allSelected) ids.forEach((id) => nextSet.delete(id))
      else ids.forEach((id) => nextSet.add(id))
      return { selectedComponentIds: Array.from(nextSet) }
    })
    get().sceneManager?.setSelection(get().selectedComponentIds)
  },

  setFolderBuildStage: (folderId, isStage) => {
    get().pushHistory('buildStage')
    set((s) => {
      const folder = s.folders[folderId]
      if (!folder) return {}
      if (isStage) {
        if (folder.buildStageOrder !== undefined) return {} // already a stage
        const existingOrders = getBuildStageFolders(s.folders).map((f) => f.buildStageOrder!)
        const nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1
        return { folders: { ...s.folders, [folderId]: { ...folder, buildStageOrder: nextOrder } } }
      }
      if (folder.buildStageOrder === undefined) return {}
      const unmarked: TreeFolder = { id: folder.id, name: folder.name, parentId: folder.parentId }
      return { folders: { ...s.folders, [folderId]: unmarked } }
    })
  },

  moveBuildStageOrder: (folderId, direction) => {
    get().pushHistory('buildStage')
    set((s) => {
      const stages = getBuildStageFolders(s.folders)
      const idx = stages.findIndex((f) => f.id === folderId)
      if (idx === -1) return {}
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= stages.length) return {}
      const a = stages[idx]
      const b = stages[swapIdx]
      return {
        folders: {
          ...s.folders,
          [a.id]: { ...a, buildStageOrder: b.buildStageOrder },
          [b.id]: { ...b, buildStageOrder: a.buildStageOrder },
        },
      }
    })
  },

  isolateFolder: (folderId) => {
    get().selectFolderContents(folderId, false)
    get().isolateSelected()
  },

  assignMaterialToComponents: async (materialId, componentIds) => {
    if (componentIds.length === 0) return
    get().pushHistory('material')
    set((s) => {
      const next = { ...s.materialAssignments }
      for (const id of componentIds) {
        if (materialId) next[id] = materialId
        else delete next[id]
      }
      return { materialAssignments: next }
    })
    await get().reapplyAllAssignments()
  },

  assignMaterialToFbxMaterialName: async (materialId, fbxMaterialName) => {
    const { objectMeta } = get()
    const targets = Array.from(objectMeta.values())
      .filter((m) => m.isMesh && m.fbxMaterialNames.includes(fbxMaterialName))
      .map((m) => m.componentId)
    await get().assignMaterialToComponents(materialId, targets)
  },

  reapplyAllAssignments: async () => {
    const { modelRoot, materialAssignments, faceMaterialAssignments } = get()
    if (!modelRoot) return
    set({ applyingMaterials: true })
    const library = useMaterialLibraryStore.getState()

    // A material can be assigned to a group node, not just a leaf mesh (e.g. selecting a whole
    // Revit family instance and assigning brick to it). Resolve each mesh's effective *base*
    // material by walking up to the nearest ancestor — including itself — that carries an
    // assignment, so it cascades onto every descendant mesh; a more specific assignment on the
    // mesh itself wins. Face-level overrides (below) always take priority over the base on the
    // specific faces they cover.
    function resolveAssignment(obj: THREE.Object3D): string | undefined {
      let cur: THREE.Object3D | null = obj
      while (cur) {
        const id = cur.userData.componentId as string | undefined
        if (id && materialAssignments[id]) return materialAssignments[id]
        cur = cur.parent
      }
      return undefined
    }

    interface MeshInfo {
      mesh: THREE.Mesh
      componentId: string
      baseMaterialId?: string
      faceOverrides?: Record<number, string>
    }

    const neededMaterialIds = new Set<string>()
    const meshInfos: MeshInfo[] = []
    modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      // Edge-preview lines (LineSegments2) and the face-highlight overlay are attached into this
      // same tree and report isMesh === true, with the line additionally stamping the same
      // componentId as its parent (see fatLineEdges.ts) — without this check, they'd be treated
      // as real mesh components and have their LineMaterial/overlay material overwritten with a
      // MeshStandardMaterial below, corrupting their GPU buffers into garbage geometry.
      if (!mesh.isMesh || isAuxiliaryMesh(mesh)) return
      const componentId = mesh.userData.componentId as string | undefined
      if (!componentId) return
      const baseMaterialId = resolveAssignment(mesh)
      const faceOverrides = faceMaterialAssignments[componentId]
      if (baseMaterialId) neededMaterialIds.add(baseMaterialId)
      if (faceOverrides) for (const matId of Object.values(faceOverrides)) neededMaterialIds.add(matId)
      meshInfos.push({ mesh, componentId, baseMaterialId, faceOverrides })
    })

    const resolvedMap = new Map<string, THREE.MeshStandardMaterial>()
    await Promise.all(
      Array.from(neededMaterialIds).map(async (id) => {
        const customMaterial = library.getById(id)
        if (!customMaterial) return
        resolvedMap.set(id, await buildThreeMaterial(customMaterial))
      }),
    )

    for (const { mesh, baseMaterialId, faceOverrides } of meshInfos) {
      const hasFaceOverrides = faceOverrides && Object.keys(faceOverrides).length > 0

      if (!hasFaceOverrides) {
        // Exactly the pre-face-assignment behaviour: no face overrides means no reason to touch
        // geometry at all, and the true original material (which may itself be a multi-material
        // array from the source FBX) is restored as-is when nothing is assigned.
        const original = mesh.userData.originalMaterial as THREE.Material | THREE.Material[] | undefined
        const material = (baseMaterialId && resolvedMap.get(baseMaterialId)) || original
        if (material) restoreCanonicalGeometry(mesh, material)
        continue
      }

      // Face overrides exist: the "base" material covering every non-overridden face on this
      // mesh must be a single Material (three.js multi-material groups can't reference a nested
      // array), so an original FBX mesh that itself had multiple sub-materials falls back to its
      // first one here. This only affects meshes the user has actually started face-overriding.
      const original = mesh.userData.originalMaterial as THREE.Material | THREE.Material[] | undefined
      const originalSingle = Array.isArray(original) ? original[0] : original
      const baseMaterial = (baseMaterialId && resolvedMap.get(baseMaterialId)) || originalSingle || new THREE.MeshStandardMaterial({ color: 0x999999 })

      const canonical = getCanonicalGeometry(mesh)
      if (!canonical) continue
      const faceCount = getFaceCount(canonical)
      const slot = new Int32Array(faceCount)
      const materials: THREE.Material[] = [baseMaterial]
      const idToSlot = new Map<string, number>()

      for (const [faceIndexStr, matId] of Object.entries(faceOverrides!)) {
        const faceIndex = Number(faceIndexStr)
        if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= faceCount) continue
        const resolved = resolvedMap.get(matId)
        if (!resolved) continue // material was deleted from the library — face falls back to base
        let slotIndex = idToSlot.get(matId)
        if (slotIndex === undefined) {
          slotIndex = materials.length
          materials.push(resolved)
          idToSlot.set(matId, slotIndex)
        }
        slot[faceIndex] = slotIndex
      }

      rebuildMeshFaceMaterials(mesh, slot, materials)
    }

    set({ applyingMaterials: false })
  },

  setProductInfo: (componentId, info) => {
    get().setProductInfoForComponents([componentId], info)
  },

  setProductInfoForComponents: (componentIds, info) => {
    if (componentIds.length === 0) return
    get().pushHistory('productInfo')
    set((s) => {
      const next = { ...s.productInfo }
      for (const componentId of componentIds) {
        if (isProductInfoEmpty(info)) delete next[componentId]
        else next[componentId] = info
      }
      return { productInfo: next }
    })
    get().reapplyProductInfo()
  },

  reapplyProductInfo: () => {
    const { modelRoot, productInfo } = get()
    if (!modelRoot) return
    // Stamped onto userData.productInfo (not materials, not geometry) so GLTFExporter's default
    // userData->extras serialization carries it through untouched — see three/exportGlb.ts,
    // which needs no changes at all for this to round-trip.
    modelRoot.traverse((obj) => {
      const componentId = obj.userData.componentId as string | undefined
      if (!componentId) return
      const info = productInfo[componentId]
      if (info) obj.userData.productInfo = info
      else delete obj.userData.productInfo
    })
  },

  selectFace: (componentId, faceIndex, additive) => {
    set((s) => {
      if (!additive || s.faceSelectComponentId !== componentId) {
        return { faceSelectComponentId: componentId, faceSelectedFaceIndices: new Set([faceIndex]) }
      }
      const next = new Set(s.faceSelectedFaceIndices)
      if (next.has(faceIndex)) next.delete(faceIndex)
      else next.add(faceIndex)
      return { faceSelectedFaceIndices: next }
    })
    const { faceSelectComponentId, faceSelectedFaceIndices, sceneManager } = get()
    sceneManager?.setFaceHighlight(faceSelectComponentId, faceSelectedFaceIndices)
  },

  addFacesToSelection: (componentId, faceIndices) => {
    if (faceIndices.length === 0) return
    set((s) => {
      if (s.faceSelectComponentId !== componentId) {
        return { faceSelectComponentId: componentId, faceSelectedFaceIndices: new Set(faceIndices) }
      }
      const next = new Set(s.faceSelectedFaceIndices)
      faceIndices.forEach((f) => next.add(f))
      return { faceSelectedFaceIndices: next }
    })
    const { faceSelectComponentId, faceSelectedFaceIndices, sceneManager } = get()
    sceneManager?.setFaceHighlight(faceSelectComponentId, faceSelectedFaceIndices)
  },

  clearFaceSelection: () => {
    set({ faceSelectComponentId: null, faceSelectedFaceIndices: new Set() })
    get().sceneManager?.setFaceHighlight(null, [])
  },

  assignMaterialToFaceSelection: async (materialId) => {
    const { faceSelectComponentId, faceSelectedFaceIndices } = get()
    if (!faceSelectComponentId || faceSelectedFaceIndices.size === 0) return
    get().pushHistory('faceMaterial')
    set((s) => {
      const nextForComponent = { ...(s.faceMaterialAssignments[faceSelectComponentId] ?? {}) }
      for (const f of faceSelectedFaceIndices) {
        if (materialId) nextForComponent[f] = materialId
        else delete nextForComponent[f]
      }
      const nextAll = { ...s.faceMaterialAssignments }
      if (Object.keys(nextForComponent).length === 0) delete nextAll[faceSelectComponentId]
      else nextAll[faceSelectComponentId] = nextForComponent
      return { faceMaterialAssignments: nextAll }
    })
    await get().reapplyAllAssignments()
    // The face-material assignment is a one-shot action, not a reason to stay in Face Select mode
    // — left active, every subsequent click would keep picking faces instead of objects, making
    // normal object selection/deselection look broken until the user noticed and switched tools
    // back manually. Clearing the face selection and returning to the Select tool means the very
    // next click behaves the way the rest of the app does.
    get().clearFaceSelection()
    set({ activeTool: 'select' })
  },

  setActiveTool: (tool) => set({ activeTool: tool }),

  setWireframe: (v) => {
    set({ wireframe: v })
    get().sceneManager?.setWireframe(v)
  },

  setProjection: (mode) => {
    set({ projection: mode })
    get().sceneManager?.setProjection(mode)
  },

  setGridVisible: (v) => {
    set({ gridVisible: v })
    get().sceneManager?.setGridVisible(v)
  },

  setAxesVisible: (v) => {
    set({ axesVisible: v })
    get().sceneManager?.setAxesVisible(v)
  },

  fitToScreen: () => get().sceneManager?.fitToScreen(),
  resetCamera: () => get().sceneManager?.resetCamera(),

  setEdgeSettings: (partial) => {
    get().pushHistory('edgeSettings')
    const merged = clampEdgeSettings({ ...get().edgeSettings, ...partial })
    set({ edgeSettings: merged })
    get().rebuildEdgePreview()
  },

  /** Single source of truth for rebuilding the live edge-preview lines — every setting that can
   * affect which segments are drawn (angle threshold, enabled, and now the hidden-edge sets)
   * funnels through here instead of each caller re-deriving the same four arguments. */
  rebuildEdgePreview: () => {
    const { modelRoot, edgePreview, edgeSettings, hiddenEdgeComponentIds, hiddenEdgeKeys } = get()
    if (!modelRoot || !edgePreview) return
    edgePreview.applyAppearance(edgeSettings)
    edgePreview.rebuild(modelRoot, edgeSettings.angleThreshold, edgeSettings.enabled, hiddenEdgeComponentIds, hiddenEdgeKeys)
  },

  toggleComponentEdgesHidden: (componentIds) => {
    const { modelRoot } = get()
    if (!modelRoot || componentIds.length === 0) return
    const expanded = collectComponentIdsIncludingDescendants(modelRoot, componentIds)
    if (expanded.size === 0) return
    get().pushHistory('edgeVisibility')
    const { hiddenEdgeComponentIds } = get()
    const allHidden = Array.from(expanded).every((id) => hiddenEdgeComponentIds.has(id))
    set((s) => {
      const next = new Set(s.hiddenEdgeComponentIds)
      for (const id of expanded) {
        if (allHidden) next.delete(id)
        else next.add(id)
      }
      return { hiddenEdgeComponentIds: next }
    })
    get().rebuildEdgePreview()
  },

  toggleEdgeHidden: (componentId, edgeKey) => {
    get().pushHistory('edgeVisibility')
    set((s) => {
      const next = { ...s.hiddenEdgeKeys }
      const forComponent = new Set(next[componentId] ?? [])
      if (forComponent.has(edgeKey)) forComponent.delete(edgeKey)
      else forComponent.add(edgeKey)
      if (forComponent.size === 0) delete next[componentId]
      else next[componentId] = forComponent
      return { hiddenEdgeKeys: next }
    })
    get().rebuildEdgePreview()
  },

  showAllHiddenEdges: () => {
    get().pushHistory('edgeVisibility')
    set({ hiddenEdgeComponentIds: new Set(), hiddenEdgeKeys: {} })
    get().rebuildEdgePreview()
  },

  setSunSettings: (partial) => {
    get().pushHistory('sunSettings')
    const merged = { ...get().sunSettings, ...partial }
    set({ sunSettings: merged })
    get().sceneManager?.applySunSettings(merged)
  },

  setExportSettings: (partial) => {
    get().pushHistory('exportSettings')
    set((s) => ({ exportSettings: { ...s.exportSettings, ...partial } }))
  },

  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  openMaterialEditor: (materialId) => set({ editingMaterialId: materialId, activeRightPanel: 'materialEditor' }),
  closeMaterialEditor: () => set({ editingMaterialId: null, activeRightPanel: 'materials' }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),

  pushHistory: (kind) => {
    const now = Date.now()
    if (kind === lastHistoryKind && now - lastHistoryPushAt < HISTORY_COALESCE_MS) {
      lastHistoryPushAt = now
      return
    }
    lastHistoryPushAt = now
    lastHistoryKind = kind
    const snapshot = getHistorySnapshot(get())
    set((s) => ({
      undoStack: [...s.undoStack, snapshot].slice(-MAX_HISTORY_ENTRIES),
      redoStack: [],
    }))
  },

  applyHistorySnapshot: (snapshot) => {
    const { modelRoot, isolateActive } = get()
    set({
      materialAssignments: snapshot.materialAssignments,
      faceMaterialAssignments: snapshot.faceMaterialAssignments,
      productInfo: snapshot.productInfo,
      folders: snapshot.folders,
      folderMembership: snapshot.folderMembership,
      hiddenComponentIds: new Set(snapshot.hiddenComponentIds),
      hiddenEdgeComponentIds: new Set(snapshot.hiddenEdgeComponentIds),
      hiddenEdgeKeys: Object.fromEntries(Object.entries(snapshot.hiddenEdgeKeys).map(([k, v]) => [k, new Set(v)])),
      edgeSettings: clampEdgeSettings(snapshot.edgeSettings),
      exportSettings: snapshot.exportSettings,
      sunSettings: snapshot.sunSettings,
    })
    get().applyComponentNames(snapshot.componentNames)
    if (modelRoot) applyVisibility(modelRoot, get().hiddenComponentIds, isolateActive ? isolateSet : null)
    void get().reapplyAllAssignments()
    get().reapplyProductInfo()
    get().rebuildEdgePreview()
    get().sceneManager?.applySunSettings(snapshot.sunSettings)
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return
    const current = getHistorySnapshot(get())
    const previous = undoStack[undoStack.length - 1]
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, current],
    }))
    get().applyHistorySnapshot(previous)
    lastHistoryKind = null // the next edit should never silently coalesce with whatever preceded the undo
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return
    const current = getHistorySnapshot(get())
    const next = redoStack[redoStack.length - 1]
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, current],
    }))
    get().applyHistorySnapshot(next)
    lastHistoryKind = null
  },
}))
