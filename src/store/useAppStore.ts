import { create } from 'zustand'
import * as THREE from 'three'
import type { ObjectMeta, EdgeSettings, ExportSettings } from '../types/scene'
import { DEFAULT_EDGE_SETTINGS, DEFAULT_EXPORT_SETTINGS, clampEdgeSettings } from '../types/scene'
import type { ObjectTreeNode } from '../types/tree'
import { importFbx } from '../three/fbxImport'
import { SceneManager, type ProjectionMode } from '../three/SceneManager'
import { EdgePreviewController } from '../three/edges/fatLineEdges'
import { buildThreeMaterial } from '../three/materialFactory'
import { getCanonicalGeometry, getFaceCount, rebuildMeshFaceMaterials, restoreCanonicalGeometry } from '../three/faceMaterials'
import { useMaterialLibraryStore } from './useMaterialLibraryStore'

export type ActiveTool = 'select' | 'orbit' | 'pan' | 'zoom' | 'measure' | 'faceSelect'
export type RightPanelKey = 'objectTree' | 'materials' | 'materialEditor' | 'edgeSettings' | null

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
  importing: boolean
  importError: string | null

  // Assignment
  materialAssignments: Record<string, string>
  applyingMaterials: boolean

  // Face-level assignment
  faceMaterialAssignments: FaceMaterialAssignments
  faceSelectComponentId: string | null
  faceSelectedFaceIndices: Set<number>

  // Visibility / isolation
  hiddenComponentIds: Set<string>
  isolateActive: boolean

  // Selection
  selectedComponentIds: string[]
  hoveredComponentId: string | null

  // Viewport / tools
  activeTool: ActiveTool
  wireframe: boolean
  projection: ProjectionMode
  gridVisible: boolean
  axesVisible: boolean

  // Edge system
  edgeSettings: EdgeSettings

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
  setHover: (componentId: string | null) => void

  toggleVisibility: (componentId: string) => void
  isolateSelected: () => void
  exitIsolate: () => void
  showAll: () => void

  assignMaterialToComponents: (materialId: string | null, componentIds: string[]) => Promise<void>
  assignMaterialToFbxMaterialName: (materialId: string | null, fbxMaterialName: string) => Promise<void>
  reapplyAllAssignments: () => Promise<void>

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

export const useAppStore = create<AppState>((set, get) => ({
  sceneManager: null,
  edgePreview: null,

  modelRoot: null,
  objectTree: null,
  objectMeta: new Map(),
  fbxMaterialNames: [],
  fbxFileName: null,
  importing: false,
  importError: null,

  materialAssignments: {},
  applyingMaterials: false,

  faceMaterialAssignments: {},
  faceSelectComponentId: null,
  faceSelectedFaceIndices: new Set(),

  hiddenComponentIds: new Set(),
  isolateActive: false,

  selectedComponentIds: [],
  hoveredComponentId: null,

  activeTool: 'select',
  wireframe: false,
  projection: 'perspective',
  gridVisible: true,
  axesVisible: true,

  edgeSettings: { ...DEFAULT_EDGE_SETTINGS },
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

      isolateSet = null
      set({
        modelRoot: result.root,
        objectTree: result.tree,
        objectMeta: result.objectMeta,
        fbxMaterialNames: result.fbxMaterialNames,
        fbxFileName: file.name,
        importing: false,
        materialAssignments: {},
        faceMaterialAssignments: {},
        faceSelectComponentId: null,
        faceSelectedFaceIndices: new Set(),
        hiddenComponentIds: new Set(),
        isolateActive: false,
        selectedComponentIds: [],
        hoveredComponentId: null,
        statusMessage: `Imported ${file.name} — ${result.objectMeta.size} objects, ${result.fbxMaterialNames.length} FBX materials.`,
      })

      sm?.setFaceHighlight(null, [])
      sm?.fitToScreen()
      get().setEdgeSettings({})
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
        }
      }
      return { selectedComponentIds: [componentId] }
    })
    get().sceneManager?.setSelection(get().selectedComponentIds)
  },

  setHover: (componentId) => {
    set({ hoveredComponentId: componentId })
    get().sceneManager?.setHover(componentId)
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

  setExportSettings: (partial) => set((s) => ({ exportSettings: { ...s.exportSettings, ...partial } })),

  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  openMaterialEditor: (materialId) => set({ editingMaterialId: materialId, activeRightPanel: 'materialEditor' }),
  closeMaterialEditor: () => set({ editingMaterialId: null, activeRightPanel: 'materials' }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
}))
