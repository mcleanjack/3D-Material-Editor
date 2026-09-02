import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EDGES_EXPORT_NAME } from '../types/scene'

export interface GlbValidationReport {
  meshCount: number
  materialCount: number
  materialsWithTextures: number
  hasEdgesObject: boolean
  edgesTriangleCount: number
  objectNames: string[]
  scene: THREE.Group
}

/** Loads a just-exported GLB back through GLTFLoader (the same loader path a downstream
 * Three.js viewer would use) and reports what actually round-tripped, so "export succeeded"
 * claims are backed by re-parsing the file rather than assumed from the export call alone. */
export async function validateGlb(blob: Blob): Promise<GlbValidationReport> {
  const url = URL.createObjectURL(blob)
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const scene = gltf.scene

    let meshCount = 0
    let hasEdgesObject = false
    let edgesTriangleCount = 0
    const materials = new Set<THREE.Material>()
    const objectNames: string[] = []

    scene.traverse((obj) => {
      objectNames.push(obj.name || '(unnamed)')
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      meshCount++
      if (obj.name === EDGES_EXPORT_NAME) {
        hasEdgesObject = true
        edgesTriangleCount = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3
      }
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
      objectNames,
      scene,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
