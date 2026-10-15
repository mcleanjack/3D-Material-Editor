import * as THREE from 'three'
import { getFaceCount, getFaceLocalPositions } from './faceMaterials'

/**
 * Reconstructs each mesh's original (pre-triangulation) polygon faces, so Face Select can
 * highlight/pick a whole quad (or n-gon) at once instead of just the one triangle the FBX
 * importer split it into.
 *
 * FBX/glTF geometry is always triangles — there's no stored record of which triangles used to be
 * one polygon. This reconstructs it heuristically: two triangles that share an edge and are
 * (near-exactly) coplanar almost always came from the same source polygon, so adjacent coplanar
 * triangles are merged into one "face group" via union-find over the mesh's edge-adjacency graph.
 * Mirrors the adjacency THREE.EdgesGeometry computes internally for the opposite purpose (finding
 * *non*-coplanar edges to draw as outlines) — see edgeGeneration.ts.
 */

/** Essentially exact coplanarity (a fraction of a degree) — tolerates floating-point noise from
 * the FBX export/triangulation, not genuine angle differences between two real adjacent faces. */
const COPLANAR_COS_THRESHOLD = Math.cos(THREE.MathUtils.degToRad(0.25))

function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

function vertexKey(v: THREE.Vector3): string {
  return `${roundCoord(v.x)},${roundCoord(v.y)},${roundCoord(v.z)}`
}

function edgeKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

interface FaceGroupData {
  /** canonical face index -> group id (the union-find root; an opaque number, not itself
   * meaningful beyond equality). */
  groupOf: Int32Array
  /** group id -> every canonical face index in that group, for O(1) membership lookup. */
  membersByGroup: Map<number, number[]>
}

function computeFaceGroups(geometry: THREE.BufferGeometry): FaceGroupData {
  const faceCount = getFaceCount(geometry)
  const parent = new Int32Array(faceCount)
  for (let i = 0; i < faceCount; i++) parent[i] = i

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  function union(a: number, b: number) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const normals: THREE.Vector3[] = new Array(faceCount)
  // edgeKey -> every face that has that edge — normally exactly 2 for a manifold mesh.
  const edgeMap = new Map<string, number[]>()

  for (let f = 0; f < faceCount; f++) {
    const [a, b, c] = getFaceLocalPositions(geometry, f)
    normals[f] = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    const ka = vertexKey(a)
    const kb = vertexKey(b)
    const kc = vertexKey(c)
    for (const key of [edgeKey(ka, kb), edgeKey(kb, kc), edgeKey(kc, ka)]) {
      let list = edgeMap.get(key)
      if (!list) {
        list = []
        edgeMap.set(key, list)
      }
      list.push(f)
    }
  }

  for (const faces of edgeMap.values()) {
    // A boundary edge (1 face) or non-manifold edge (3+ faces) never merges — only a clean
    // 2-triangle shared edge is the triangulation seam this is meant to undo.
    if (faces.length !== 2) continue
    const [f1, f2] = faces
    if (normals[f1].dot(normals[f2]) >= COPLANAR_COS_THRESHOLD) union(f1, f2)
  }

  const groupOf = new Int32Array(faceCount)
  const membersByGroup = new Map<number, number[]>()
  for (let f = 0; f < faceCount; f++) {
    const root = find(f)
    groupOf[f] = root
    let members = membersByGroup.get(root)
    if (!members) {
      members = []
      membersByGroup.set(root, members)
    }
    members.push(f)
  }

  return { groupOf, membersByGroup }
}

/** Keyed by geometry.uuid, like faceMaterials.ts's own canonical-geometry cache — a mesh's
 * canonical geometry is never mutated in place (only ever swapped for a new one), so nothing
 * needs to invalidate this across the geometry's lifetime. */
const cache = new Map<string, FaceGroupData>()

function getFaceGroupData(geometry: THREE.BufferGeometry): FaceGroupData {
  let data = cache.get(geometry.uuid)
  if (!data) {
    data = computeFaceGroups(geometry)
    cache.set(geometry.uuid, data)
  }
  return data
}

/** Every canonical face index belonging to the same reconstructed polygon as `faceIndex`,
 * including itself — what Face Select actually selects/highlights for a single click. */
export function getCoplanarFaceGroupMembers(geometry: THREE.BufferGeometry, faceIndex: number): number[] {
  const { groupOf, membersByGroup } = getFaceGroupData(geometry)
  return membersByGroup.get(groupOf[faceIndex]) ?? [faceIndex]
}
