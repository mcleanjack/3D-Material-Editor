import * as THREE from 'three'

/**
 * Face-level (per-triangle) multi-material support for imported meshes.
 *
 * Every imported mesh keeps its untouched, original geometry as `userData.canonicalGeometry`
 * (stamped once at FBX import time — see three/fbxImport.ts). All face indices used anywhere in
 * app state (selection sets, saved assignments) are relative to that canonical geometry's face
 * order, which never changes for the lifetime of the mesh.
 *
 * When a mesh has no face-level overrides, `mesh.geometry` simply *is* the canonical geometry and
 * `mesh.material` is a single material — behaviourally identical to before this feature existed.
 *
 * When it has overrides, `rebuildMeshFaceMaterials` derives a NEW BufferGeometry whose faces are
 * reordered so that same-material faces are contiguous, adds `BufferGeometry.groups` for each
 * contiguous run, and sets `mesh.material` to the matching array — the standard three.js/glTF
 * multi-material representation, which round-trips through GLTFExporter/GLTFLoader natively. The
 * mapping from that derived geometry's (reordered) face indices back to canonical ones is kept in
 * `userData.derivedFaceToCanonical` so raycast hits against the *current* geometry can be
 * translated back to stable, canonical face identity.
 */

const CANONICAL_GEOMETRY_KEY = 'canonicalGeometry'
const DERIVED_MAP_KEY = 'derivedFaceToCanonical'

export function setCanonicalGeometry(mesh: THREE.Mesh, geometry: THREE.BufferGeometry) {
  mesh.userData[CANONICAL_GEOMETRY_KEY] = geometry
}

export function getCanonicalGeometry(mesh: THREE.Mesh): THREE.BufferGeometry | undefined {
  return mesh.userData[CANONICAL_GEOMETRY_KEY] as THREE.BufferGeometry | undefined
}

export function getFaceCount(geometry: THREE.BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count
  return Math.floor(count / 3)
}

function getFaceVertexIndices(geometry: THREE.BufferGeometry, faceIndex: number): [number, number, number] {
  const index = geometry.index
  if (index) {
    return [index.getX(faceIndex * 3), index.getX(faceIndex * 3 + 1), index.getX(faceIndex * 3 + 2)]
  }
  return [faceIndex * 3, faceIndex * 3 + 1, faceIndex * 3 + 2]
}

/** The 3 local-space vertex positions of a face, read from a given geometry (canonical or
 * derived — face indices only need to match whichever geometry is passed in). */
export function getFaceLocalPositions(geometry: THREE.BufferGeometry, faceIndex: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const pos = geometry.attributes.position
  const [a, b, c] = getFaceVertexIndices(geometry, faceIndex)
  return [
    new THREE.Vector3().fromBufferAttribute(pos, a),
    new THREE.Vector3().fromBufferAttribute(pos, b),
    new THREE.Vector3().fromBufferAttribute(pos, c),
  ]
}

/** Translates a faceIndex from a raycast hit against `mesh.geometry` (which may currently be a
 * reordered derived geometry) back to the stable canonical face index. Identity when the mesh
 * has no active face overrides. */
export function toCanonicalFaceIndex(mesh: THREE.Mesh, derivedFaceIndex: number): number {
  const map = mesh.userData[DERIVED_MAP_KEY] as Int32Array | undefined
  return map ? map[derivedFaceIndex] : derivedFaceIndex
}

interface FaceGroup {
  start: number
  count: number
  materialIndex: number
}

function partitionFacesBySlot(faceMaterialSlot: Int32Array): { order: number[]; groups: FaceGroup[] } {
  const bySlot = new Map<number, number[]>()
  for (let f = 0; f < faceMaterialSlot.length; f++) {
    const slot = faceMaterialSlot[f]
    let list = bySlot.get(slot)
    if (!list) {
      list = []
      bySlot.set(slot, list)
    }
    list.push(f)
  }

  const order: number[] = []
  const groups: FaceGroup[] = []
  for (const slot of Array.from(bySlot.keys()).sort((a, b) => a - b)) {
    const faces = bySlot.get(slot)!
    const startFace = order.length
    order.push(...faces)
    groups.push({ start: startFace * 3, count: faces.length * 3, materialIndex: slot })
  }
  return { order, groups }
}

function buildIndexedDerivedGeometry(canonical: THREE.BufferGeometry, order: number[]): THREE.BufferGeometry {
  const oldIndex = canonical.index!
  const newIndexArray = new Uint32Array(order.length * 3)
  for (let i = 0; i < order.length; i++) {
    const f = order[i]
    newIndexArray[i * 3] = oldIndex.getX(f * 3)
    newIndexArray[i * 3 + 1] = oldIndex.getX(f * 3 + 1)
    newIndexArray[i * 3 + 2] = oldIndex.getX(f * 3 + 2)
  }
  const derived = new THREE.BufferGeometry()
  // Attributes are reused by reference (untouched) — only the index order changes, so vertex
  // data (including skinning attributes) never needs to be copied or re-validated.
  for (const name in canonical.attributes) {
    derived.setAttribute(name, canonical.getAttribute(name))
  }
  derived.setIndex(new THREE.BufferAttribute(newIndexArray, 1))
  return derived
}

function buildNonIndexedDerivedGeometry(canonical: THREE.BufferGeometry, order: number[]): THREE.BufferGeometry {
  const derived = new THREE.BufferGeometry()
  for (const name in canonical.attributes) {
    const oldAttr = canonical.getAttribute(name)
    const itemSize = oldAttr.itemSize
    const Ctor = (oldAttr.array as Float32Array).constructor as { new (n: number): typeof oldAttr.array }
    const newArray = new Ctor(order.length * 3 * itemSize)
    for (let i = 0; i < order.length; i++) {
      const f = order[i]
      for (let v = 0; v < 3; v++) {
        const srcVert = f * 3 + v
        const dstVert = i * 3 + v
        for (let k = 0; k < itemSize; k++) {
          newArray[dstVert * itemSize + k] = oldAttr.array[srcVert * itemSize + k]
        }
      }
    }
    derived.setAttribute(name, new THREE.BufferAttribute(newArray, itemSize, oldAttr.normalized))
  }
  return derived
}

/** Restores a mesh to its untouched canonical geometry + a single material, disposing any
 * previously-derived multi-material geometry. This is the "no face overrides" state. */
export function restoreCanonicalGeometry(mesh: THREE.Mesh, material: THREE.Material | THREE.Material[]) {
  const canonical = getCanonicalGeometry(mesh)
  if (canonical && mesh.geometry !== canonical) {
    mesh.geometry.dispose()
    mesh.geometry = canonical
  }
  delete mesh.userData[DERIVED_MAP_KEY]
  mesh.material = material
}

/**
 * Rebuilds a mesh's geometry/material to reflect `faceMaterialSlot` (length === canonical face
 * count; value = index into `materials`) against the mesh's canonical geometry. `materials[0]` is
 * always the "base" material used by every face not explicitly overridden.
 */
export function rebuildMeshFaceMaterials(mesh: THREE.Mesh, faceMaterialSlot: Int32Array, materials: THREE.Material[]) {
  const canonical = getCanonicalGeometry(mesh)
  if (!canonical) return

  let hasOverride = false
  for (let i = 0; i < faceMaterialSlot.length; i++) {
    if (faceMaterialSlot[i] !== 0) {
      hasOverride = true
      break
    }
  }

  if (!hasOverride) {
    restoreCanonicalGeometry(mesh, materials[0])
    return
  }

  const { order, groups } = partitionFacesBySlot(faceMaterialSlot)
  const derived = canonical.index ? buildIndexedDerivedGeometry(canonical, order) : buildNonIndexedDerivedGeometry(canonical, order)
  derived.clearGroups()
  for (const g of groups) derived.addGroup(g.start, g.count, g.materialIndex)
  derived.computeBoundingBox()
  derived.computeBoundingSphere()

  if (mesh.geometry !== canonical) mesh.geometry.dispose()
  mesh.geometry = derived
  mesh.userData[DERIVED_MAP_KEY] = Int32Array.from(order)
  mesh.material = materials
}
