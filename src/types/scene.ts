/** Component Edge display settings — shared by live viewport preview and GLB export. */
export interface EdgeSettings {
  enabled: boolean
  /** px in the live viewport; converted to a physical tube radius at export time. */
  lineWeight: number
  color: string
  opacity: number
  /** Degrees. Faces meeting at an angle >= this are considered a real edge. */
  angleThreshold: number
}

export const DEFAULT_EDGE_SETTINGS: EdgeSettings = {
  enabled: true,
  lineWeight: 2,
  color: '#111318',
  opacity: 0.9,
  angleThreshold: 35,
}

/** Below this, EdgesGeometry starts treating near-coplanar triangulation seams within a single
 * flat face as "real" edges rather than filtering them out — on a dense or large model that can
 * multiply the raw edge count by 30x+ (measured), which is the single biggest driver of an
 * oversized `__COMPONENT_EDGES__` export. Clamped centrally (not just in the slider) so a
 * pathological value can't reach the exporter via a saved project either. */
export const MIN_EDGE_ANGLE_THRESHOLD = 15
export const MAX_EDGE_ANGLE_THRESHOLD = 89

export function clampEdgeSettings(settings: EdgeSettings): EdgeSettings {
  return {
    ...settings,
    angleThreshold: Math.min(MAX_EDGE_ANGLE_THRESHOLD, Math.max(MIN_EDGE_ANGLE_THRESHOLD, settings.angleThreshold)),
  }
}

export interface ExportSettings {
  includeMaterials: boolean
  includeTextures: boolean
  includeEdges: boolean
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  includeMaterials: true,
  includeTextures: true,
  includeEdges: true,
}

/** Per-object bookkeeping that lives alongside the live THREE hierarchy, keyed by componentId. */
export interface ObjectMeta {
  componentId: string
  name: string
  /** Material name(s) as they appeared on the source FBX mesh, before any assignment. */
  fbxMaterialNames: string[]
  assignedMaterialId: string | null
  visible: boolean
  isMesh: boolean
}

export const COMPONENT_ID_KEY = 'componentId'
export const EDGES_EXPORT_NAME = '__COMPONENT_EDGES__'

/** userData keys stamped on viewport-only helper meshes (edge preview lines, face-selection
 * highlight overlays). Both extend THREE.Mesh under the hood (LineSegments2 does too), so any
 * code that walks the live model tree looking for "real" meshes — to reapply materials, raycast
 * for selection, export, etc. — must skip these or it will treat UI chrome as model geometry. */
export const AUX_MESH_KEYS = ['isEdgePreviewLine', 'isFaceHighlight'] as const

export function isAuxiliaryMesh(obj: { userData: Record<string, unknown> }): boolean {
  return AUX_MESH_KEYS.some((key) => obj.userData[key] === true)
}
