/**
 * Save/open a project as a real, portable file on disk (a .zip under the hood), as an
 * alternative to the in-browser project list (see useProjectStore.ts / OpenProjectModal.tsx).
 *
 * A project's material assignments and linked details are only ever *references* — the actual
 * custom materials live in the shared Material Library, and material textures / linked-detail
 * PDFs live in the shared IndexedDB asset store (see db/assetCache.ts). Neither travels with the
 * project record on its own, so a file meant to open correctly on a different computer has to
 * bundle copies of everything the project actually references:
 *
 *   project.zip
 *   ├── project.json           — the AuthoringProject record itself
 *   ├── materials.json         — CustomMaterial[] referenced by this project
 *   ├── assets-manifest.json   — { [assetId]: mimeType }, since a zip entry has no MIME of its own
 *   ├── assets/<assetId>       — raw bytes for every texture/PDF referenced by the above
 *   └── model.fbx              — the source FBX itself, if one was loaded when this was saved
 *                                (see sourceFbxAssetId on AuthoringProject) — without this, opening
 *                                the file elsewhere would restore materials/settings but no model
 *                                to apply them to, same as the in-browser project list already
 *                                requires a manual re-import of the same-named FBX to resume.
 *
 * Importing never overwrites an existing local material or asset with the same id — ids are
 * random UUIDs (see utils/id.ts), so a collision only happens when re-opening a file that came
 * from (or was already imported into) this same browser, in which case "already have it, skip"
 * is exactly right.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { AuthoringProject } from '../types/project'
import type { CustomMaterial } from '../types/material'
import { useAppStore } from '../store/useAppStore'
import { useProjectStore, buildProjectSnapshot } from '../store/useProjectStore'
import { useMaterialLibraryStore } from '../store/useMaterialLibraryStore'
import { getAssetBlob } from '../db/assetCache'
import { dbGetAsset, dbPutAsset, dbPutMaterial, dbPutProject } from '../db/db'
import { makeId } from './id'
import { downloadBlob } from '../three/exportGlb'

const TEXTURE_SLOT_KEYS = ['diffuseMap', 'bumpNormalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const

const PICKER_TYPES: FilePickerAcceptType[] = [{ description: 'Material Editor Project', accept: { 'application/zip': ['.zip'] } }]

function materialAssetRefs(material: CustomMaterial): { assetId: string; mimeType: string }[] {
  return TEXTURE_SLOT_KEYS.map((k) => material[k])
    .filter((ref): ref is NonNullable<typeof ref> => !!ref)
    .map((ref) => ({ assetId: ref.assetId, mimeType: 'image/png' }))
}

/** Builds the zip bytes for the current project — the current app state, plus every custom
 * material and linked-detail PDF it references. */
async function buildProjectZip(): Promise<{ bytes: Uint8Array<ArrayBuffer>; fileName: string }> {
  const projectStore = useProjectStore.getState()
  const id = projectStore.currentProjectId ?? makeId('proj')
  const project = buildProjectSnapshot(id, projectStore.currentProjectName)

  const referencedMaterialIds = new Set<string>()
  Object.values(project.materialAssignments).forEach((matId) => referencedMaterialIds.add(matId))
  Object.values(project.faceMaterialAssignments).forEach((byFace) => Object.values(byFace).forEach((matId) => referencedMaterialIds.add(matId)))
  const materials = useMaterialLibraryStore.getState().materials.filter((m) => referencedMaterialIds.has(m.id))

  const assetRefs = materials.flatMap(materialAssetRefs)
  for (const info of Object.values(project.productInfo ?? {})) {
    if (info.linkedDetail) assetRefs.push({ assetId: info.linkedDetail.assetId, mimeType: info.linkedDetail.mimeType })
  }

  const assetManifest: Record<string, string> = {}
  const assetEntries: Record<string, Uint8Array> = {}
  for (const { assetId, mimeType } of assetRefs) {
    if (assetManifest[assetId]) continue // same asset referenced by more than one material/object
    const blob = await getAssetBlob(assetId)
    assetEntries[`assets/${assetId}`] = new Uint8Array(await blob.arrayBuffer())
    assetManifest[assetId] = mimeType
  }

  const modelEntry: Record<string, Uint8Array> = {}
  if (project.sourceFbxAssetId) {
    const fbxBlob = await getAssetBlob(project.sourceFbxAssetId)
    modelEntry['model.fbx'] = new Uint8Array(await fbxBlob.arrayBuffer())
  }

  const bytes = zipSync({
    'project.json': strToU8(JSON.stringify(project)),
    'materials.json': strToU8(JSON.stringify(materials)),
    'assets-manifest.json': strToU8(JSON.stringify(assetManifest)),
    ...assetEntries,
    ...modelEntry,
  })

  return { bytes, fileName: `${project.name || 'project'}.zip` }
}

async function saveBytesToDisk(bytes: Uint8Array<ArrayBuffer>, suggestedName: string): Promise<void> {
  const blob = new Blob([bytes], { type: 'application/zip' })
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName, types: PICKER_TYPES })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the dialog
      // Any other failure (permission denied, etc.) — fall through to the plain download.
    }
  }
  downloadBlob(blob, suggestedName)
}

/** Saves the current project as a self-contained .zip. Uses the native "Save As" dialog (so the
 * user can pick their Desktop directly) where the browser supports it, falling back to a plain
 * download — which most browsers still let the user redirect via a "Save As" prompt or their
 * configured downloads location — everywhere else (Firefox, Safari). */
export async function exportProjectToFile(): Promise<void> {
  const { bytes, fileName } = await buildProjectZip()
  await saveBytesToDisk(bytes, fileName)
}

function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip'
    input.className = 'hidden'
    input.addEventListener(
      'change',
      () => {
        resolve(input.files?.[0] ?? null)
        input.remove()
      },
      { once: true },
    )
    document.body.appendChild(input)
    input.click()
  })
}

async function pickProjectFile(): Promise<File | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
      return await handle.getFile()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      // Any other failure — fall through to the plain file input.
    }
  }
  return pickFileViaInput()
}

/** Imports a project .zip: unpacks it, adds any material/asset it references that this browser
 * doesn't already have (never overwriting an existing one), registers the project in the local
 * "Open Project" list too (so it's available for quick resume from then on), re-imports the
 * bundled source FBX if one was included, and loads it. */
async function importProjectZip(file: File): Promise<void> {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))

  const project = JSON.parse(strFromU8(zip['project.json'])) as AuthoringProject
  const materials = JSON.parse(strFromU8(zip['materials.json'])) as CustomMaterial[]
  const assetManifest = JSON.parse(strFromU8(zip['assets-manifest.json'])) as Record<string, string>

  const existingMaterialIds = new Set(useMaterialLibraryStore.getState().materials.map((m) => m.id))
  for (const material of materials) {
    if (!existingMaterialIds.has(material.id)) await dbPutMaterial(material)
  }

  for (const [assetId, mimeType] of Object.entries(assetManifest)) {
    const bytes = zip[`assets/${assetId}`]
    if (!bytes) continue
    if (await dbGetAsset(assetId)) continue
    await dbPutAsset(assetId, new Blob([bytes], { type: mimeType }))
  }

  await dbPutProject(project)
  await useMaterialLibraryStore.getState().loadAll()
  await useProjectStore.getState().loadAll()

  // loadProject() only reapplies material/product-info assignments once a live model with a
  // matching fbxFileName already exists (see useProjectStore.loadProject) — normally the user
  // has to re-import the source FBX by hand first. When this file bundled the FBX itself, do
  // that reimport automatically so opening it is genuinely one step.
  const fbxBytes = zip['model.fbx']
  if (fbxBytes) {
    const fbxFile = new File([fbxBytes], project.sourceFbxName || 'model.fbx', { type: 'application/octet-stream' })
    await useAppStore.getState().importFbxFile(fbxFile)
  }

  useProjectStore.getState().loadProject(project.id)
}

/** Opens a project from a file the user picks from disk. No-ops if they cancel the picker. */
export async function importProjectFromFile(): Promise<void> {
  const file = await pickProjectFile()
  if (!file) return
  try {
    await importProjectZip(file)
  } catch (err) {
    useAppStore.getState().setStatusMessage(`Failed to open project file: ${err instanceof Error ? err.message : String(err)}`)
  }
}
