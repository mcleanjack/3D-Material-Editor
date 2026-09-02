import { create } from 'zustand'
import * as THREE from 'three'
import type { ObjectMeta, EdgeSettings, ExportSettings } from '../types/scene'
import { DEFAULT_EDGE_SETTINGS, DEFAULT_EXPORT_SETTINGS } from '../types/scene'
import type { ObjectTreeNode } from '../types/tree'
import { importFbx } from '../three/fbxImport'
import { SceneManager, type ProjectionMode } from '../three/SceneManager'
import { EdgePreviewController } from '../three/edges/fatLineEdges'
import { buildThreeMaterial } from '../three/materialFactory'
import { useMaterialLibraryStore } from './useMaterialLibraryStore'

export type ActiveTool = 'select' | 'orbit' | 'pan' | 'zoom' | 'measure'
export type RightPanelKey = 'objectTree' | 'materials' | 'materialEditor' | 'edgeSettings' | null

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
        hiddenComponentIds: new Set(),
        isolateActive: false,
        selectedComponentIds: [],
        hoveredComponentId: null,
        statusMessage: `Imported ${file.name} — ${result.objectMeta.size} objects, ${result.fbxMaterialNames.length} FBX materials.`,
      })

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
    const { modelRoot, materialAssignments } = get()
    if (!modelRoot) return
    set({ applyingMaterials: true })
    const library = useMaterialLibraryStore.getState()

    // A material can be assigned to a group node, not just a leaf mesh (e.g. selecting a whole
    // Revit family instance and assigning brick to it). Resolve each mesh's effective material
    // by walking up to the nearest ancestor — including itself — that carries an assignment, so
    // it cascades onto every descendant mesh; a more specific assignment on the mesh itself wins.
    function resolveAssignment(obj: THREE.Object3D): string | undefined {
      let cur: THREE.Object3D | null = obj
      while (cur) {
        const id = cur.userData.componentId as string | undefined
        if (id && materialAssignments[id]) return materialAssignments[id]
        cur = cur.parent
      }
      return undefined
    }

    const jobs: Promise<void>[] = []
    modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const componentId = mesh.userData.componentId as string | undefined
      if (!componentId) return
      const assignedId = resolveAssignment(mesh)

      if (!assignedId) {
        const original = mesh.userData.originalMaterial as THREE.Material | THREE.Material[] | undefined
        if (original) mesh.material = original
        return
      }

      const customMaterial = library.getById(assignedId)
      if (!customMaterial) return
      jobs.push(
        buildThreeMaterial(customMaterial).then((builtMat) => {
          mesh.material = builtMat
        }),
      )
    })

    await Promise.all(jobs)
    set({ applyingMaterials: false })
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
    const merged = { ...get().edgeSettings, ...partial }
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
