import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getEdgesGeometry } from './edgeGeneration'
import { EDGES_EXPORT_NAME, type EdgeSettings } from '../../types/scene'

/** Meters of tube radius per unit of "Edge Line Weight" (which is specified in the UI as an
 * approximate 1-5px screen-space value). glTF has no notion of screen-space line width, so
 * export must bake an actual physical thickness; this constant picks a radius that reads as a
 * comparably thin outline at typical architectural-detail viewing distances (scene units = m). */
const TUBE_RADIUS_PER_WEIGHT = 0.0015
const RADIAL_SEGMENTS = 4

const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _altUp = new THREE.Vector3(1, 0, 0)

/** Appends a thin square-section prism between p1 and p2 to the given accumulator arrays. */
function appendSegmentPrism(positions: number[], indices: number[], p1: THREE.Vector3, p2: THREE.Vector3, radius: number) {
  _dir.subVectors(p2, p1)
  const length = _dir.length()
  if (length < 1e-8) return
  _dir.normalize()

  const upRef = Math.abs(_dir.dot(_worldUp)) > 0.99 ? _altUp : _worldUp
  _right.crossVectors(_dir, upRef).normalize()
  _up.crossVectors(_right, _dir).normalize()

  const base = positions.length / 3
  const corners = [
    [-radius, -radius],
    [radius, -radius],
    [radius, radius],
    [-radius, radius],
  ]

  for (const end of [p1, p2]) {
    for (const [rx, ry] of corners) {
      positions.push(
        end.x + _right.x * rx + _up.x * ry,
        end.y + _right.y * rx + _up.y * ry,
        end.z + _right.z * rx + _up.z * ry,
      )
    }
  }

  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const a = base + i
    const b = base + ((i + 1) % RADIAL_SEGMENTS)
    const c = base + RADIAL_SEGMENTS + ((i + 1) % RADIAL_SEGMENTS)
    const d = base + RADIAL_SEGMENTS + i
    indices.push(a, b, c, a, c, d)
  }
}

/**
 * Builds a single merged, exportable mesh (`__COMPONENT_EDGES__`) representing every visible
 * component's edges as real 3D geometry (thin square-section tubes), in world space, fully
 * decoupled from the source model geometry — per the spec, this must not modify or merge into
 * the original model, and must survive a glTF round-trip (unlike the LineMaterial/LineSegments2
 * "fat lines" used for the live viewport, whose shader does not export to glTF).
 */
export function buildExportEdgesMesh(modelGroup: THREE.Group, settings: EdgeSettings): THREE.Mesh | null {
  const radius = Math.max(settings.lineWeight, 0.1) * TUBE_RADIUS_PER_WEIGHT
  const positions: number[] = []
  const indices: number[] = []

  modelGroup.updateWorldMatrix(true, true)

  modelGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible || mesh.userData.isEdgePreviewLine) return

    const edgesGeom = getEdgesGeometry(mesh.geometry, settings.angleThreshold)
    const arr = edgesGeom.attributes.position.array as Float32Array

    for (let i = 0; i < arr.length; i += 6) {
      _p1.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mesh.matrixWorld)
      _p2.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(mesh.matrixWorld)
      appendSegmentPrism(positions, indices, _p1, _p2, radius)
    }
  })

  if (positions.length === 0) return null

  const geometries: THREE.BufferGeometry[] = []
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geometries.push(geo)

  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false)

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(settings.color),
    transparent: settings.opacity < 1,
    opacity: settings.opacity,
    depthWrite: settings.opacity >= 1,
  })

  const mesh = new THREE.Mesh(merged, material)
  mesh.name = EDGES_EXPORT_NAME
  return mesh
}
