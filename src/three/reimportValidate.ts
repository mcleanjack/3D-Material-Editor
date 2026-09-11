import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { EDGES_EXPORT_NAME } from '../types/scene'

export interface GlbValidationReport {
  meshCount: number
  materialCount: number
  materialsWithTextures: number
  hasEdgesObject: boolean
  edgesTriangleCount: number
  /** Objects that survived export/reload as a per-face material split. GLTFExporter writes a
   * multi-material mesh as one glTF mesh with several primitives (one per BufferGeometry group);
   * GLTFLoader in turn re-loads each primitive as its own single-material THREE.Mesh and wraps
   * the set in a plain THREE.Group — so on the *reloaded* scene, "still multi-material" shows up
   * as a Group whose direct children are all meshes, not as an array on `.material` (that array
   * only exists pre-export, on the live authoring scene). */
  multiMaterialObjectCount: number
  totalPrimitivesFromSplitObjects: number
  objectNames: string[]
  scene: THREE.Group
}

/** Loads a just-exported GLB back through GLTFLoader (the same loader path a downstream
 * Three.js viewer would use) and reports what actually round-tripped, so "export succeeded"
 * claims are backed by re-parsing the file rather than assumed from the export call alone.
 *
 * `renderer` is only needed to validate an *optimized* export: KTX2Loader.detectSupport() needs a
 * live WebGLRenderer to pick a transcode target, so it's wired up only when one is passed in. A
 * plain (non-optimized) export never contains KTX2 textures and validates fine without it. */
export async function validateGlb(blob: Blob, renderer?: THREE.WebGLRenderer): Promise<GlbValidationReport> {
  const url = URL.createObjectURL(blob)
  let ktx2Loader: KTX2Loader | undefined
  try {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    if (renderer) {
      ktx2Loader = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(renderer)
      loader.setKTX2Loader(ktx2Loader)
    }
    const gltf = await loader.loadAsync(url)
    const scene = gltf.scene

    let meshCount = 0
    let hasEdgesObject = false
    let edgesTriangleCount = 0
    let multiMaterialObjectCount = 0
    let totalPrimitivesFromSplitObjects = 0
    const materials = new Set<THREE.Material>()
    const objectNames: string[] = []

    scene.traverse((obj) => {
      objectNames.push(obj.name || '(unnamed)')

      // __COMPONENT_EDGES__ is itself a Group of per-component meshes (see tubeEdges.ts) — matches
      // the same "Group of only meshes" shape the multi-material-split heuristic below looks for,
      // so it's excluded from that count and handled on its own terms here instead. (Reloaded via
      // GLTFLoader, this node's `.type` comes back as plain "Object3D", not "Group" — the name is
      // the only reliable signal.)
      if (obj.name === EDGES_EXPORT_NAME) {
        hasEdgesObject = true
        obj.children.forEach((child) => {
          const edgeMesh = child as THREE.Mesh
          if (!edgeMesh.isMesh) return
          edgesTriangleCount += (edgeMesh.geometry.index?.count ?? edgeMesh.geometry.attributes.position.count) / 3
        })
        return
      }

      if (obj.type === 'Group' && obj.children.length > 1 && obj.children.every((c) => (c as THREE.Mesh).isMesh)) {
        multiMaterialObjectCount++
        totalPrimitivesFromSplitObjects += obj.children.length
      }

      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      meshCount++
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => materials.add(m))
    })

    let materialsWithTextures = 0
    for (const m of materials) {
      const std = m as THREE.MeshStandardMaterial
      if (std.map || std.bumpMap || std.normalMap || std.roughnessMap || std.metalnessMap) {
        materialsWithTextures++
      }
    }

    return {
      meshCount,
      materialCount: materials.size,
      materialsWithTextures,
      hasEdgesObject,
      edgesTriangleCount,
      multiMaterialObjectCount,
      totalPrimitivesFromSplitObjects,
      objectNames,
      scene,
    }
  } finally {
    ktx2Loader?.dispose()
    URL.revokeObjectURL(url)
  }
}
