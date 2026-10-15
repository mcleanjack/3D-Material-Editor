import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { isAuxiliaryMesh, type EdgeSettings } from '../../types/scene'
import { edgeSegmentKey, getEdgesGeometry } from './edgeGeneration'

const EDGE_LINE_NAME = '__edge_preview_line__'
const EMPTY_HIDDEN_KEYS: ReadonlySet<string> = new Set()

/**
 * Live-viewport component edge overlay. Uses LineSegments2/LineMaterial ("fat lines") for
 * correct screen-space line width — WebGL ignores THREE.LineBasicMaterial.linewidth, so a plain
 * LineSegments approach can't honour the Edge Line Weight control. This is viewport-only: it is
 * NOT what gets exported to GLB (see three/edges/tubeEdges.ts for the exportable geometry), since
 * LineMaterial's shader does not round-trip through glTF.
 */
export class EdgePreviewController {
  readonly material: LineMaterial
  private readonly lines = new Map<string, LineSegments2>()

  constructor() {
    this.material = new LineMaterial({
      color: 0x111318,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
    })
    this.material.worldUnits = false
  }

  setResolution(width: number, height: number) {
    this.material.resolution.set(width, height)
  }

  applyAppearance(settings: EdgeSettings) {
    this.material.color.set(settings.color)
    this.material.opacity = settings.opacity
    this.material.linewidth = settings.lineWeight
    this.material.needsUpdate = true
  }

  /** Every live edge-preview line currently in the scene, for the Edge Select raycast — see
   * SceneManager.raycastEdgeAtNdc. */
  getLines(): THREE.Object3D[] {
    return Array.from(this.lines.values())
  }

  /** Resolves a raycast hit's segment index (LineSegments2.raycast's `faceIndex`) back to the
   * stable edge key that segment was built from, so a click can toggle the right entry in
   * hiddenEdgeKeys regardless of how the (already-filtered) rendered array is ordered. */
  resolveHit(line: THREE.Object3D, segmentIndex: number): { componentId: string; edgeKey: string } | null {
    const componentId = line.userData.componentId as string | undefined
    const keys = line.userData.edgeKeys as string[] | undefined
    if (!componentId || !keys || segmentIndex < 0 || segmentIndex >= keys.length) return null
    return { componentId, edgeKey: keys[segmentIndex] }
  }

  /** Rebuilds edge line objects for the current model + angle threshold. Attaches each edge
   * line as a child of its source mesh so it automatically follows that mesh's (and its
   * ancestors') transforms without any extra bookkeeping.
   *
   * Collects target meshes in a read-only traversal first, then mutates the tree in a second
   * pass — LineSegments2 extends THREE.Mesh (isMesh === true), so adding one as a child *during*
   * `traverse()` would make that same walk immediately descend into the freshly-added line,
   * see it as another mesh to attach a line to, and recurse without end.
   *
   * `hiddenEdgeComponentIds` drops a whole mesh's edges (no line built at all); `hiddenEdgeKeys`
   * (componentId -> Set of edgeSegmentKey) drops individual segments within a mesh that still
   * shows some edges — both read by useAppStore so this never needs to know how they were set. */
  rebuild(
    modelGroup: THREE.Group,
    angleThreshold: number,
    visible: boolean,
    hiddenEdgeComponentIds: ReadonlySet<string> = EMPTY_HIDDEN_KEYS,
    hiddenEdgeKeys: Readonly<Record<string, ReadonlySet<string>>> = {},
  ) {
    this.clear()
    if (!visible) return

    const targets: THREE.Mesh[] = []
    modelGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry || isAuxiliaryMesh(mesh)) return
      targets.push(mesh)
    })

    for (const mesh of targets) {
      const componentId = mesh.userData.componentId as string | undefined
      if (componentId && hiddenEdgeComponentIds.has(componentId)) continue

      const edgesGeom = getEdgesGeometry(mesh.geometry, angleThreshold)
      const arr = edgesGeom.attributes.position.array as Float32Array
      if (arr.length === 0) continue

      const hiddenKeys = (componentId && hiddenEdgeKeys[componentId]) || EMPTY_HIDDEN_KEYS
      const positions: number[] = []
      const keys: string[] = [] // keys[renderedSegmentIndex] = that segment's stable edgeSegmentKey
      for (let i = 0; i < arr.length; i += 6) {
        const key = edgeSegmentKey(arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4], arr[i + 5])
        if (hiddenKeys.has(key)) continue
        positions.push(arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4], arr[i + 5])
        keys.push(key)
      }
      if (positions.length === 0) continue

      const lineGeom = new LineSegmentsGeometry()
      lineGeom.setPositions(positions)

      const line = new LineSegments2(lineGeom, this.material)
      line.name = EDGE_LINE_NAME
      line.userData.isEdgePreviewLine = true
      line.userData.componentId = componentId
      line.userData.edgeKeys = keys
      line.computeLineDistances()
      line.renderOrder = 1

      mesh.add(line)
      if (componentId) this.lines.set(componentId, line)
    }
  }

  setVisible(visible: boolean) {
    for (const line of this.lines.values()) line.visible = visible
  }

  clear() {
    for (const line of this.lines.values()) {
      line.parent?.remove(line)
      line.geometry.dispose()
    }
    this.lines.clear()
  }

  dispose() {
    this.clear()
    this.material.dispose()
  }
}

