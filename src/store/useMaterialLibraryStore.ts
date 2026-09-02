import { create } from 'zustand'
import type { CustomMaterial } from '../types/material'
import { createBlankMaterial } from '../types/material'
import { dbDeleteMaterial, dbGetAllMaterials, dbPutMaterial } from '../db/db'
import { deleteAsset } from '../db/assetCache'
import { invalidateMaterialCache } from '../three/materialFactory'
import { makeId } from '../utils/id'

interface MaterialLibraryState {
  materials: CustomMaterial[]
  loaded: boolean
  loadAll: () => Promise<void>
  createMaterial: (name: string, category?: string) => Promise<CustomMaterial>
  saveMaterial: (material: CustomMaterial) => Promise<void>
  duplicateMaterial: (id: string) => Promise<CustomMaterial | null>
  deleteMaterial: (id: string) => Promise<void>
  getById: (id: string) => CustomMaterial | undefined
}

export const useMaterialLibraryStore = create<MaterialLibraryState>((set, get) => ({
  materials: [],
  loaded: false,

  loadAll: async () => {
    const materials = await dbGetAllMaterials()
    materials.sort((a, b) => a.name.localeCompare(b.name))
    set({ materials, loaded: true })
  },

  createMaterial: async (name, category) => {
    const material = createBlankMaterial(makeId('mat'), name)
    if (category) material.category = category
    await dbPutMaterial(material)
    set((s) => ({ materials: [...s.materials, material].sort((a, b) => a.name.localeCompare(b.name)) }))
    return material
  },

  saveMaterial: async (material) => {
    const exists = get().materials.some((m) => m.id === material.id)
    const updated: CustomMaterial = { ...material, updatedAt: Date.now(), revision: material.revision + 1 }
    await dbPutMaterial(updated)
    invalidateMaterialCache(updated.id)
    set((s) => ({
      materials: (exists ? s.materials.map((m) => (m.id === updated.id ? updated : m)) : [...s.materials, updated]).sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    }))
  },

  duplicateMaterial: async (id) => {
    const source = get().materials.find((m) => m.id === id)
    if (!source) return null
    const now = Date.now()
    const copy: CustomMaterial = {
      ...source,
      id: makeId('mat'),
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
    await dbPutMaterial(copy)
    set((s) => ({ materials: [...s.materials, copy].sort((a, b) => a.name.localeCompare(b.name)) }))
    return copy
  },

  deleteMaterial: async (id) => {
    const material = get().materials.find((m) => m.id === id)
    await dbDeleteMaterial(id)
    invalidateMaterialCache(id)
    if (material) {
      const assetIds = [
        material.diffuseMap?.assetId,
        material.bumpNormalMap?.assetId,
        material.roughnessMap?.assetId,
        material.metalnessMap?.assetId,
        material.aoMap?.assetId,
        material.emissiveMap?.assetId,
      ].filter((x): x is string => !!x)
      await Promise.all(assetIds.map((assetId) => deleteAsset(assetId)))
    }
    set((s) => ({ materials: s.materials.filter((m) => m.id !== id) }))
  },

  getById: (id) => get().materials.find((m) => m.id === id),
}))
