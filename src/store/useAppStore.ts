import { create } from 'zustand'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ObjectMeta, EdgeSettings, ExportSettings } from '../types/scene'
import { DEFAULT_EDGE_SETTINGS, DEFAULT_EXPORT_SETTINGS, clampEdgeSettings } from '../types/scene'
import { removeNodesFromTree, renameNodeInTree, type ObjectTreeNode } from '../types/tree'
import type { TreeFolder } from '../types/folder'
import { collectFolderComponentIds, getBuildStageFolders } from '../types/folder'
import type { SunSettings } from '../types/sun'
import { DEFAULT_SUN_SETTINGS } from '../types/sun'
import type { ProductInfo } from '../types/product'
import { isProductInfoEmpty } from '../types/product'
import { importFbx } from '../three/fbxImport'
import { storeAssetFile } from '../db/assetCache'
import { SceneManager, type ProjectionMode } from '../three/SceneManager'
import { EdgePreviewController } from '../three/edges/fatLineEdges'
import { buildThreeMaterial } from '../three/materialFactory'
import { getCanonicalGeometry, getFaceCount, rebuildMeshFaceMaterials, restoreCanonicalGeometry, setCanonicalGeometry } from '../three/faceMaterials'
import { useMaterialLibraryStore } from './useMaterialLibraryStore'
import { makeId } from '../utils/id'

export type ActiveTool = 'select' | 'orbit' | 'pan' | 'zoom' | 'measure' | 'faceSelect'
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

  // Sun (viewport-only lighting/shadow preview — see src/types/sun.ts)
  sunSettings: SunSettings

  // Export
  exportSettings: ExportSettings

  // UI
  activeRightPanel: RightPanelKey
  editingMaterialId: string | null
  statusMessage: string

  // Actions
  initSceneManager: (sm: SceneManager) => void
  importFbxFile: (file: File) => Promise<void>

  selectComponent: (componentId: string | null, additive?: boolean) => void
  selectComponentRange: (componentIds: string[]) => void
  setHover: (componentId: string | null) => void
  renameComponent: (componentId: string, name: string) => void
  /** Combines 2+ selected meshes into a single mesh (one merged BufferGeometry, world transforms
   * baked in), replacing their tree nodes with one new node. Ignores any non-mesh objects in the
   * selection; no-ops if fewer than 2 meshes end up selected. Each source mesh's own assigned
   * material is preserved as a per-face override on the merged mesh (see faceMaterials.ts) so
   * distinct materials round-trip through reapplyAllAssignments just like any other
   * multi-material mesh, not just at the moment of the merge. */
  mergeSelectedComponents: () => Promise<void>

  toggleVisibility: (componentId: string) => void
  isolateSelected: () => void
  exitIsolate: () => void
  showAll: () => void

  createFolderFromSelection: (name: string, componentIds: string[]) => string
  renameFolder: (folderId: string, name: string) => void
  deleteFolder: (folderId: string) => void
  moveComponentsToFolder: (componentIds: string[], folderId: string | null) => void
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
  setSunSettings: (partial: Partial<SunSettings>) => void
  setExportSettings: (partial: Partial<ExportSettings>) => void

  setActiveRightPanel: (panel: RightPanelKey) => void
  openMaterialEditor: (materialId: string | null) => void
  closeMaterialEditor: () => void
  setStatusMessage: (msg: string) => void
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
  sunSettings: { ...DEFAULT_SUN_SETTINGS },
  exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

  activeRightPanel: 'objectTree',
  editingMaterialId: null,
  statusMessage: 'Ready. Import an FBX to begin.',

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
        selectedComponentIds: [],
        lastSelectedComponentId: null,
        hoveredComponentId: null,
        statusMessage: `Imported ${file.name} — ${result.objectMeta.size} objects, ${result.fbxMaterialNames.length} FBX materials.`,
      })

      sm?.setFaceHighlight(null, [])
      sm?.fitToScreen()
      get().setEdgeSettings({})
      get().setSunSettings({})
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

  mergeSelectedComponents: async () => {
    const { modelRoot, selectedComponentIds, objectMeta, objectTree, materialAssignments } = get()
    if (!modelRoot || !objectTree || selectedComponentIds.length < 2) return

    const wantedIds = new Set(selectedComponentIds)
    const meshes: THREE.Mesh[] = []
    modelRoot.traverse((obj) => {
      const id = obj.userData.componentId as string | undefined
      if (id && wantedIds.has(id) && (obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh)
    })
    if (meshes.length < 2) return

    // Bake each mesh's world transform into its own geometry (cloned — the same BufferGeometry
    // is commonly shared by every instance of a repeated part, so mutating it in place would
    // corrupt every other un-merged instance still using it), all relative to modelRoot's own
    // frame, so the single merged mesh can be added as modelRoot's child with an identity
    // transform and still land exactly where the originals were.
    modelRoot.updateWorldMatrix(true, true)
    const invRoot = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert()
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone()
      const local = new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld)
      geometry.applyMatrix4(local)
      return geometry
    })

    // One material slot per source mesh (per-face multi-material meshes contribute only their
    // first material — merging preserves the common "identical repeated part" case exactly;
    // finer per-face detail on an individual instance is not preserved through a merge).
    const materialsPerMesh = meshes.map((mesh) => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material))
    const uniformMaterial = materialsPerMesh.every((m) => m === materialsPerMesh[0])

    const mergedGeometry = mergeGeometries(geometries, !uniformMaterial)
    if (!mergedGeometry) return

    const componentId = makeId('merged')
    const baseName = objectMeta.get(meshes[0].userData.componentId as string)?.name ?? 'Merged Object'
    const mergedMesh = new THREE.Mesh(mergedGeometry, uniformMaterial ? materialsPerMesh[0] : materialsPerMesh)
    mergedMesh.name = `${baseName} (merged x${meshes.length})`
    mergedMesh.userData.componentId = componentId
    // Registers the merge into the exact same canonical-geometry / originalMaterial machinery
    // every other mesh uses (see faceMaterials.ts and the "no face overrides" branch below in
    // reapplyAllAssignments) — without this, the very next *unrelated* material assignment
    // anywhere else in the scene would trigger reapplyAllAssignments(), which walks every mesh
    // and, finding nothing tracked for this one, would have nothing to reconstruct its merged
    // material array from. originalMaterial mirrors how a real multi-sub-material FBX mesh
    // already represents "several materials, nothing explicitly assigned" — the same fallback
    // a mesh that's never had an app-level assignment relies on.
    setCanonicalGeometry(mergedMesh, mergedGeometry)
    mergedMesh.userData.originalMaterial = materialsPerMesh
    modelRoot.add(mergedMesh)

    const removedIds = meshes.map((mesh) => mesh.userData.componentId as string)
    for (const mesh of meshes) mesh.parent?.remove(mesh)

    const removedIdSet = new Set(removedIds)
    const groupMaterialIds = removedIds.map((id) => materialAssignments[id])

    // Each source mesh's own assigned material (when it has one) becomes an explicit per-face
    // override on the merged mesh — the same representation assignMaterialToFaceSelection
    // already uses for "several materials, one mesh" — so the merge is fully re-derivable
    // through reapplyAllAssignments, not just correct at the instant of the merge. A source mesh
    // with no app-level assignment (still showing its raw FBX material) can't be expressed this
    // way and falls back to whatever originalMaterial covers it — correct now, but only durably
    // correct when every differing group has a trackable id.
    const faceOverrides: Record<number, string> = {}
    let faceOffset = 0
    for (let i = 0; i < geometries.length; i++) {
      const faceCount = getFaceCount(geometries[i])
      const materialId = groupMaterialIds[i]
      if (i > 0 && materialId && materialId !== groupMaterialIds[0]) {
        for (let f = 0; f < faceCount; f++) faceOverrides[faceOffset + f] = materialId
      }
      faceOffset += faceCount
    }

    set((s) => {
      const nextObjectMeta = new Map(s.objectMeta)
      for (const id of removedIds) nextObjectMeta.delete(id)
      nextObjectMeta.set(componentId, {
        componentId,
        name: mergedMesh.name,
        fbxMaterialNames: [],
        assignedMaterialId: null,
        visible: true,
        isMesh: true,
      })

      const nextFolderMembership = { ...s.folderMembership }
      for (const id of removedIds) delete nextFolderMembership[id]

      const nextMaterialAssignments = { ...s.materialAssignments }
      for (const id of removedIds) delete nextMaterialAssignments[id]
      if (groupMaterialIds[0]) nextMaterialAssignments[componentId] = groupMaterialIds[0]

      const nextFaceMaterialAssignments = { ...s.faceMaterialAssignments }
      for (const id of removedIds) delete nextFaceMaterialAssignments[id]
      if (Object.keys(faceOverrides).length > 0) nextFaceMaterialAssignments[componentId] = faceOverrides

      const nextProductInfo = { ...s.productInfo }
      for (const id of removedIds) delete nextProductInfo[id]

      const nextHidden = new Set(s.hiddenComponentIds)
      for (const id of removedIds) nextHidden.delete(id)

      const strippedTree = s.objectTree ? removeNodesFromTree(s.objectTree, removedIdSet) : s.objectTree
      const mergedNode: ObjectTreeNode = { componentId, name: mergedMesh.name, isMesh: true, children: [] }
      const nextTree = strippedTree ? { ...strippedTree, children: [...strippedTree.children, mergedNode] } : strippedTree

      return {
        objectMeta: nextObjectMeta,
        folderMembership: nextFolderMembership,
        materialAssignments: nextMaterialAssignments,
        faceMaterialAssignments: nextFaceMaterialAssignments,
        productInfo: nextProductInfo,
        hiddenComponentIds: nextHidden,
        objectTree: nextTree,
        selectedComponentIds: [componentId],
        lastSelectedComponentId: componentId,
      }
    })

    get().reapplyProductInfo()
    await get().reapplyAllAssignments()
    get().sceneManager?.setSelection([componentId])
    set({ statusMessage: `Merged ${meshes.length} objects into "${mergedMesh.name}".` })
  },

  toggleVisibility: (componentId) => {
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
    isolateSet = null
    set({ hiddenComponentIds: new Set(), isolateActive: false })
    const { modelRoot } = get()
    if (modelRoot) applyVisibility(modelRoot, new Set(), null)
  },

  createFolderFromSelection: (name, componentIds) => {
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
    set((s) => {
      const folder = s.folders[folderId]
      if (!folder) return {}
      return { folders: { ...s.folders, [folderId]: { ...folder, name } } }
    })
  },

  deleteFolder: (folderId) => {
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
    set((s) => {
      const membership = { ...s.folderMembership }
      for (const cid of componentIds) {
        if (folderId) membership[cid] = folderId
        else delete membership[cid]
      }
      return { folderMembership: membership }
    })
  },

  moveFolderToFolder: (folderId, parentId) => {
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
      if (!mesh.isMesh) return
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
    const merged = clampEdgeSettings({ ...get().edgeSettings, ...partial })
    set({ edgeSettings: merged })
    const { modelRoot, edgePreview } = get()
    if (!modelRoot || !edgePreview) return
    edgePreview.applyAppearance(merged)
    edgePreview.rebuild(modelRoot, merged.angleThreshold, merged.enabled)
  },

  setSunSettings: (partial) => {
    const merged = { ...get().sunSettings, ...partial }
    set({ sunSettings: merged })
    get().sceneManager?.applySunSettings(merged)
  },

  setExportSettings: (partial) => set((s) => ({ exportSettings: { ...s.exportSettings, ...partial } })),

  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  openMaterialEditor: (materialId) => set({ editingMaterialId: materialId, activeRightPanel: 'materialEditor' }),
  closeMaterialEditor: () => set({ editingMaterialId: null, activeRightPanel: 'materials' }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
}))
