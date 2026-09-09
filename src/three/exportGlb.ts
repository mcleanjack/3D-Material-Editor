import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { EdgeSettings, ExportSettings } from '../types/scene'
import type { TreeFolder } from '../types/folder'
import { getBuildStageFolders, resolveBuildStageAssignments } from '../types/folder'
import type { ProductInfo } from '../types/product'
import { getAssetBlob } from '../db/assetCache'
import { buildExportEdgesMesh } from './edges/tubeEdges'
import { injectGlbRootExtras } from './glbBinary'

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

const TEXTURE_SLOT_KEYS = ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const

/** materialFactory.ts's applyUvTransform sets the same repeat/offset/rotation/center on every
 * texture slot of a given material, so reading it off whichever slot is present first is enough
 * — there's nothing to reconcile between slots. Returns null for the (overwhelmingly common)
 * identity case, so callers can skip baking entirely for materials that don't need it. */
function getMaterialUvTransform(material: THREE.Material): THREE.Matrix3 | null {
  const std = material as THREE.MeshStandardMaterial
  const tex = TEXTURE_SLOT_KEYS.map((key) => std[key]).find((t): t is THREE.Texture => !!t)
  if (!tex) return null
  if (tex.repeat.x === 1 && tex.repeat.y === 1 && tex.offset.x === 0 && tex.offset.y === 0 && tex.rotation === 0) return null
  const matrix = new THREE.Matrix3()
  matrix.setUvTransform(tex.offset.x, tex.offset.y, tex.repeat.x, tex.repeat.y, tex.rotation, tex.center.x, tex.center.y)
  return matrix
}

/** Clones `material` with every texture slot also cloned (Material.clone() only shallow-copies
 * texture *references* — it would leave the clone pointing at the exact same Texture objects as
 * the live scene's material) and each cloned texture's transform reset to identity. The clone is
 * what gets assigned onto export-clone meshes in place of the original, so resetting the
 * transform here never touches the live scene's material or texture. */
function cloneMaterialWithResetUv(material: THREE.Material): THREE.Material {
  const clone = material.clone()
  const std = clone as THREE.MeshStandardMaterial
  for (const key of TEXTURE_SLOT_KEYS) {
    const tex = std[key]
    if (!tex) continue
    const texClone = tex.clone()
    texClone.offset.set(0, 0)
    texClone.repeat.set(1, 1)
    texClone.rotation = 0
    texClone.center.set(0, 0)
    texClone.needsUpdate = true
    std[key] = texClone
  }
  return clone
}

const _uv = new THREE.Vector2()

function applyMatrixToUvIndices(uv: THREE.BufferAttribute, matrix: THREE.Matrix3, vertexIndices: Iterable<number>) {
  for (const i of vertexIndices) {
    _uv.fromBufferAttribute(uv, i).applyMatrix3(matrix)
    uv.setXY(i, _uv.x, _uv.y)
  }
}

function* vertexIndicesInRange(geometry: THREE.BufferGeometry, start: number, count: number): Generator<number> {
  if (geometry.index) {
    for (let i = start; i < start + count; i++) yield geometry.index.getX(i)
  } else {
    for (let i = start; i < start + count; i++) yield i
  }
}

/**
 * Bakes each material's UV repeat/offset/rotation (see materialFactory.ts's applyUvTransform,
 * driven by the material's physical pattern size in the Material Editor) directly into every
 * assigned mesh's own UV coordinates, instead of leaving it to GLTFExporter's
 * `KHR_texture_transform` extension. That extension is optional per the glTF spec — a viewer
 * that doesn't implement it silently ignores the transform and renders the texture at native
 * 1:1 UV tiling instead of the intended repeat, which is exactly a "texture looks the wrong
 * scale" bug in any such viewer. Baked UV coordinates are core glTF, so they render identically
 * in any compliant viewer regardless of extension support — this is what makes the exported GLB
 * self-sufficient rather than dependent on a specific downstream viewer's feature set.
 *
 * Reads every material's transform up front (several meshes commonly share one material
 * instance — see buildThreeMaterial's id:revision cache — and cloneSkeleton shares material
 * references between the export clone and the live scene just like it shares geometry, so a
 * mesh's `.material` here is still the *live* material/texture until this function replaces it).
 * Each distinct material needing a bake gets exactly one reset-clone (via
 * cloneMaterialWithResetUv), reused across every mesh that shares it, and every affected mesh is
 * repointed at that clone — never mutating the original material or texture in place.
 */
function bakeTextureTransformsIntoUv(root: THREE.Object3D) {
  const transformByMaterial = new Map<THREE.Material, THREE.Matrix3>()

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of mats) {
      if (transformByMaterial.has(material)) continue
      const matrix = getMaterialUvTransform(material)
      if (matrix) transformByMaterial.set(material, matrix)
    }
  })

  if (transformByMaterial.size === 0) return

  const resetClonesByMaterial = new Map<THREE.Material, THREE.Material>()
  const resetClone = (material: THREE.Material) => {
    let clone = resetClonesByMaterial.get(material)
    if (!clone) {
      clone = cloneMaterialWithResetUv(material)
      resetClonesByMaterial.set(material, clone)
    }
    return clone
  }

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (!mats.some((m) => transformByMaterial.has(m))) return

    // Components can share one BufferGeometry instance (repeated identical hardware parts) —
    // clone before mutating UVs so this never corrupts a sibling mesh or the live editor scene.
    mesh.geometry = mesh.geometry.clone()
    const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute | undefined

    if (Array.isArray(mesh.material)) {
      // Per-face material overrides (see faceMaterials.ts): each geometry group can carry a
      // different material/transform, so bake only the vertex range each group actually owns.
      if (uv) {
        for (const group of mesh.geometry.groups) {
          const material = mesh.material[group.materialIndex ?? 0]
          const matrix = material && transformByMaterial.get(material)
          if (matrix) applyMatrixToUvIndices(uv, matrix, vertexIndicesInRange(mesh.geometry, group.start, group.count))
        }
      }
      mesh.material = mesh.material.map((m) => (transformByMaterial.has(m) ? resetClone(m) : m))
    } else {
      const matrix = transformByMaterial.get(mesh.material)
      if (matrix && uv) applyMatrixToUvIndices(uv, matrix, vertexIndicesInRange(mesh.geometry, 0, uv.count))
      mesh.material = resetClone(mesh.material)
    }
  })
}

/** One row of the root-level `extras.buildStages` summary — see the module doc comment below. */
interface BuildStageSummary {
  id: string
  name: string
  order: number
  objectNames: string[]
}

/**
 * Stamps each staged object's clone with `buildStageId`/`buildStageName`/`buildStageOrder`
 * (mirroring the productInfo <-> extras convention — see useAppStore.reapplyProductInfo) and
 * returns a summary row per build-stage folder, so the caller can also embed a single top-level
 * `extras.buildStages` array (built from folders/exports, this is grouping metadata only — it
 * never touches geometry, materials, or the edges mesh, and objects outside any build-stage
 * folder are left with no stage userData at all, unaffected).
 */
function stampBuildStages(
  clone: THREE.Object3D,
  folders: Record<string, TreeFolder>,
  assignments: Map<string, TreeFolder>,
): BuildStageSummary[] {
  const stageFolders = getBuildStageFolders(folders)
  if (stageFolders.length === 0) return []

  const objectNamesByStage = new Map<string, string[]>()

  clone.traverse((obj) => {
    const componentId = obj.userData.componentId as string | undefined
    if (!componentId) return
    const stage = assignments.get(componentId)
    if (!stage) return
    obj.userData.buildStageId = stage.id
    obj.userData.buildStageName = stage.name
    obj.userData.buildStageOrder = stage.buildStageOrder
    const names = objectNamesByStage.get(stage.id) ?? []
    names.push(obj.name || componentId)
    objectNamesByStage.set(stage.id, names)
  })

  return stageFolders.map((f) => ({
    id: f.id,
    name: f.name,
    order: f.buildStageOrder!,
    objectNames: objectNamesByStage.get(f.id) ?? [],
  }))
}

/**
 * Stamps matching `buildStageId`/`buildStageName`/`buildStageOrder` onto each per-component
 * `__COMPONENT_EDGES__` mesh (see tubeEdges.ts), resolved via its `sourceComponentId` rather than
 * its own `componentId` (which is a derived, edges-only id — see buildExportEdgesMesh) — so a
 * component's edge outline turns on/off together with the component itself, stage for stage.
 * Deliberately excluded from the `extras.buildStages` summary's `objectNames`: that list is meant
 * to describe the actual authored objects in a stage, not the synthetic edge helpers derived
 * from them.
 */
function stampEdgeMeshBuildStages(edgesGroup: THREE.Object3D, assignments: Map<string, TreeFolder>) {
  edgesGroup.traverse((obj) => {
    const sourceComponentId = obj.userData.sourceComponentId as string | undefined
    if (!sourceComponentId) return
    const stage = assignments.get(sourceComponentId)
    if (!stage) return
    obj.userData.buildStageId = stage.id
    obj.userData.buildStageName = stage.name
    obj.userData.buildStageOrder = stage.buildStageOrder
  })
}

/** Base64-encodes a Blob's bytes in fixed-size chunks — `String.fromCharCode(...bytes)` on a
 * multi-megabyte Uint8Array can blow the engine's max-argument-count limit, so this builds the
 * intermediate string incrementally instead of in one spread call. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/**
 * Embeds each selected object's linked PDF detail (see src/types/product.ts) as base64 data
 * directly on that object's `userData.productInfo.linkedDetail`, so GLTFExporter's existing
 * userData -> extras serialization carries the PDF bytes into the GLB automatically — the same
 * mechanism that already carries the rest of productInfo, no exporter API changes needed.
 *
 * Only ever touches the export clone — THREE.Object3D.copy() deep-clones userData via a
 * JSON round-trip, so `clone.userData.productInfo` is already independent of the live store's
 * `productInfo[componentId]` object by the time this runs.
 *
 * A linked detail whose blob asset has gone missing (never expected, but not a reason to fail an
 * otherwise-good export) is left as metadata-only: its filename/size still export, just without
 * `dataBase64`.
 */
async function embedLinkedDetails(root: THREE.Object3D): Promise<void> {
  const targets: THREE.Object3D[] = []
  root.traverse((obj) => {
    if ((obj.userData.productInfo as ProductInfo | undefined)?.linkedDetail) targets.push(obj)
  })

  await Promise.all(
    targets.map(async (obj) => {
      const info = obj.userData.productInfo as ProductInfo
      const linkedDetail = info.linkedDetail!
      try {
        const blob = await getAssetBlob(linkedDetail.assetId)
        const dataBase64 = await blobToBase64(blob)
        obj.userData.productInfo = { ...info, linkedDetail: { ...linkedDetail, dataBase64 } }
      } catch {
        // Missing asset — leave the metadata-only reference already in place untouched.
      }
    }),
  )
}

export interface ExportGlbOptions {
  modelGroup: THREE.Group
  exportSettings: ExportSettings
  edgeSettings: EdgeSettings
  /** Build-stage grouping — see src/types/folder.ts. Optional/defaults to none, so callers that
   * don't use folders/build stages get byte-identical export behavior to before this feature. */
  folders?: Record<string, TreeFolder>
  folderMembership?: Record<string, string>
}

/**
 * Exports the current model + (optionally) a dedicated __COMPONENT_EDGES__ group (one mesh per
 * component, see tubeEdges.ts) to a binary GLB. Works on a cloned scene graph so none of this
 * mutates the live authoring scene: node clones share geometry with the originals (cheap) but get
 * their own material assignments so export settings (materials/textures on-off) never affect what
 * renders in the editor.
 */
export async function exportGlb({ modelGroup, exportSettings, edgeSettings, folders = {}, folderMembership = {} }: ExportGlbOptions): Promise<Blob> {
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
  bakeTextureTransformsIntoUv(clone)
  const stageAssignments = resolveBuildStageAssignments(folders, folderMembership)
  const buildStages = stampBuildStages(clone, folders, stageAssignments)
  await embedLinkedDetails(clone)
  exportRoot.add(clone)

  // Export's own Component Edges toggle is independent of the live viewport's show/hide —
  // per spec, an author may want edges visible in the editor but excluded from the shipped GLB.
  if (exportSettings.includeEdges) {
    const edgesGroup = buildExportEdgesMesh(modelGroup, edgeSettings)
    if (edgesGroup) {
      stampEdgeMeshBuildStages(edgesGroup, stageAssignments)
      exportRoot.add(edgesGroup)
    }
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

  // GLTFExporter has no option to set root-level extras itself — see glbBinary.ts — so the
  // build-stages summary (when there is one) is spliced into the already-exported GLB's JSON
  // chunk rather than threaded through the exporter's own API.
  const finalBuffer = buildStages.length > 0 ? injectGlbRootExtras(result, { buildStages }) : result
  return new Blob([finalBuffer], { type: 'model/gltf-binary' })
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
