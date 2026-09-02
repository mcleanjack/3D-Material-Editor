import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { EdgeSettings, ExportSettings } from '../types/scene'
import { buildExportEdgesMesh } from './edges/tubeEdges'

const PREVIEW_LINE_NAME = '__edge_preview_line__'

function stripNonExportableChildren(root: THREE.Object3D) {
  const toRemove: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj.name === PREVIEW_LINE_NAME) toRemove.push(obj)
  })
  for (const obj of toRemove) obj.parent?.remove(obj)
}

function neutralMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9, metalness: 0 })
}

function stripTextures(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const clone = mat.clone()
  clone.map = null
  clone.bumpMap = null
  clone.normalMap = null
  clone.roughnessMap = null
  clone.metalnessMap = null
  clone.aoMap = null
  clone.emissiveMap = null
  clone.needsUpdate = true
  return clone
}

function applyMaterialExportSettings(root: THREE.Object3D, exportSettings: ExportSettings) {
  // Many meshes commonly share the same assigned material (a whole wall of individually-outlined
  // bricks, say) — both neutralMaterial() and stripTextures() build a fresh Material instance, so
  // without caching, "Model Materials off" would embed one neutral material PER MESH rather than
  // one shared one, and "Textures off" would embed one stripped clone PER MESH PER SHARED
  // MATERIAL instead of one per distinct original material. Embedded material count must track
  // distinct materials actually used, not mesh count.
  const sharedNeutral = exportSettings.includeMaterials ? null : neutralMaterial()
  const strippedCache = new Map<THREE.Material, THREE.Material>()

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return

    const applyOne = (m: THREE.Material) => {
      if (!exportSettings.includeMaterials) return sharedNeutral!
      const std = m as THREE.MeshStandardMaterial
      if (!exportSettings.includeTextures && 'map' in std) {
        let stripped = strippedCache.get(m)
        if (!stripped) {
          stripped = stripTextures(std)
          strippedCache.set(m, stripped)
        }
        return stripped
      }
      return m
    }

    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(applyOne) : applyOne(mesh.material)
  })
}

export interface ExportGlbOptions {
  modelGroup: THREE.Group
  exportSettings: ExportSettings
  edgeSettings: EdgeSettings
}

/**
 * Exports the current model + (optionally) a dedicated __COMPONENT_EDGES__ mesh to a binary GLB.
 * Works on a cloned scene graph so none of this mutates the live authoring scene: node clones
 * share geometry with the originals (cheap) but get their own material assignments so export
 * settings (materials/textures on-off) never affect what's rendered in the editor.
 */
export async function exportGlb({ modelGroup, exportSettings, edgeSettings }: ExportGlbOptions): Promise<Blob> {
  const fbxRoot = modelGroup.children[0]
  if (!fbxRoot) throw new Error('No model loaded to export')

  modelGroup.updateWorldMatrix(true, true)

  const exportRoot = new THREE.Group()
  exportRoot.name = fbxRoot.name || 'Model'

  // Plain Object3D.clone(true) does NOT re-target a SkinnedMesh's skeleton onto the cloned bone
  // hierarchy (it keeps pointing at the original bones), which produces an invalid glTF skin on
  // export. SkeletonUtils.clone handles that remapping; it's a safe drop-in for non-skinned
  // hierarchies too (most Revit exports), so it's used unconditionally rather than branching.
  const clone = cloneSkeleton(fbxRoot) as THREE.Object3D
  stripNonExportableChildren(clone)
  applyMaterialExportSettings(clone, exportSettings)
  exportRoot.add(clone)

  // Export's own Component Edges toggle is independent of the live viewport's show/hide —
  // per spec, an author may want edges visible in the editor but excluded from the shipped GLB.
  if (exportSettings.includeEdges) {
    const edgesMesh = buildExportEdgesMesh(modelGroup, edgeSettings)
    if (edgesMesh) exportRoot.add(edgesMesh)
  }

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(exportRoot, {
    binary: true,
    embedImages: true,
    onlyVisible: false,
    truncateDrawRange: true,
  })

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('Expected binary GLB output')
  }
  return new Blob([result], { type: 'model/gltf-binary' })
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
