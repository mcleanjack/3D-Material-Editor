import * as THREE from 'three'
import { getEdgesGeometry } from './edgeGeneration'
import { EDGES_EXPORT_NAME, isAuxiliaryMesh, type EdgeSettings } from '../../types/scene'

/** Meters of ribbon half-width per unit of "Edge Line Weight" (which is specified in the UI as an
 * approximate 1-5px screen-space value). glTF has no notion of screen-space line width, so
 * export must bake an actual physical thickness; this constant picks a width that reads as a
 * comparably thin outline at typical architectural-detail viewing distances (scene units = m). */
const RIBBON_HALF_WIDTH_PER_WEIGHT = 0.0015

const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _altUp = new THREE.Vector3(1, 0, 0)

/**
 * Appends a thin flat ribbon (one quad, 2 triangles) between p1 and p2 to the accumulator
 * arrays — 4x fewer triangles than the square-section tube this replaced (8 triangles/segment,
 * a 4-sided prism), which was the single largest driver of `__COMPONENT_EDGES__` bloat on
 * real models (hundreds of thousands of raw edge segments × 8 triangles adds up fast). A flat
 * ribbon reads the same as a tube at normal viewing/print distance for an architectural outline
 * — these lines are meant to be seen face-on, not inspected in cross-section — so the material
 * is rendered double-sided (see buildExportEdgesMesh) to stay visible from either side of the
 * ribbon's plane regardless of orbit direction.
 */
function appendSegmentRibbon(positions: number[], indices: number[], p1: THREE.Vector3, p2: THREE.Vector3, halfWidth: number) {
  _dir.subVectors(p2, p1)
  const length = _dir.length()
  if (length < 1e-8) return
  _dir.normalize()

  const upRef = Math.abs(_dir.dot(_worldUp)) > 0.99 ? _altUp : _worldUp
  _right.crossVectors(_dir, upRef).normalize()
  _up.crossVectors(_right, _dir).normalize()

  const base = positions.length / 3
  for (const end of [p1, p2]) {
    positions.push(end.x - _up.x * halfWidth, end.y - _up.y * halfWidth, end.z - _up.z * halfWidth)
    positions.push(end.x + _up.x * halfWidth, end.y + _up.y * halfWidth, end.z + _up.z * halfWidth)
  }
  // base+0/1 = p1 -/+ half-width, base+2/3 = p2 -/+ half-width.
  indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
}

/**
 * Builds an exportable `__COMPONENT_EDGES__` group holding one mesh per visible component's
 * edges, as real 3D geometry (thin flat ribbons) in world space, fully decoupled from the source
 * model geometry — per the spec, this must not modify or merge into the original model, and must
 * survive a glTF round-trip (unlike the LineMaterial/LineSegments2 "fat lines" used for the live
 * viewport, whose shader does not export to glTF).
 *
 * One mesh per component (not one merged mesh for the whole model) so each edge mesh can carry
 * its own `sourceComponentId` in userData — the same userData -> extras path already used for
 * componentId/productInfo elsewhere in this app — letting a downstream viewer show/hide a
 * component's edges together with the component itself (or by build stage, once exportGlb.ts
 * stamps matching buildStage fields onto these meshes too). All meshes share one material
 * instance, so this is still one shared material in the exported GLB either way.
 */
export function buildExportEdgesMesh(modelGroup: THREE.Group, settings: EdgeSettings): THREE.Group | null {
  const halfWidth = Math.max(settings.lineWeight, 0.1) * RIBBON_HALF_WIDTH_PER_WEIGHT

  modelGroup.updateWorldMatrix(true, true)

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(settings.color),
    transparent: settings.opacity < 1,
    opacity: settings.opacity,
    depthWrite: settings.opacity >= 1,
    side: THREE.DoubleSide,
  })

  const group = new THREE.Group()
  group.name = EDGES_EXPORT_NAME

  modelGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible || isAuxiliaryMesh(mesh)) return

    const sourceComponentId = mesh.userData.componentId as string | undefined
    const edgesGeom = getEdgesGeometry(mesh.geometry, settings.angleThreshold)
    const arr = edgesGeom.attributes.position.array as Float32Array
    if (arr.length === 0) return

    const positions: number[] = []
    const indices: number[] = []
    for (let i = 0; i < arr.length; i += 6) {
      _p1.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mesh.matrixWorld)
      _p2.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(mesh.matrixWorld)
      appendSegmentRibbon(positions, indices, _p1, _p2, halfWidth)
    }
    if (positions.length === 0) return

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const edgeMesh = new THREE.Mesh(geometry, material)
    edgeMesh.name = `${mesh.name || 'component'}__edges__`
    if (sourceComponentId) {
      edgeMesh.userData.componentId = `${sourceComponentId}::edges`
      edgeMesh.userData.sourceComponentId = sourceComponentId
    }
    group.add(edgeMesh)
  })

  return group.children.length > 0 ? group : null
}
