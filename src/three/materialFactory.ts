import * as THREE from 'three'
import type { CustomMaterial, TextureMapRef } from '../types/material'
import { getAssetUrl } from '../db/assetCache'
import { physicalSizeToRepeat } from '../utils/uvRepeat'

const textureLoader = new THREE.TextureLoader()
const textureCache = new Map<string, THREE.Texture>()

/** Built materials keyed by `${materialId}:${revision}` so edits invalidate stale instances
 * without leaking GPU resources for every intermediate edit. */
const materialCache = new Map<string, THREE.MeshStandardMaterial>()

async function loadTexture(ref: TextureMapRef, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
  const cacheKey = `${ref.assetId}:${colorSpace}`
  const cached = textureCache.get(cacheKey)
  if (cached) return cached
  const url = await getAssetUrl(ref.assetId)
  const texture = await textureLoader.loadAsync(url)
  texture.colorSpace = colorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  textureCache.set(cacheKey, texture)
  return texture
}

function applyUvTransform(texture: THREE.Texture, material: CustomMaterial) {
  const [repeatX, repeatY] = physicalSizeToRepeat(material.physicalWidthMm, material.physicalHeightMm)
  texture.repeat.set(repeatX, repeatY)
  texture.offset.set(material.textureOffsetU, material.textureOffsetV)
  texture.rotation = (material.textureRotationDeg * Math.PI) / 180
  texture.center.set(0.5, 0.5)
  texture.needsUpdate = true
}

/** Builds a fresh THREE.MeshStandardMaterial from a CustomMaterial definition, uncached. Used
 * for the material editor's live preview, where the draft changes on every keystroke and would
 * otherwise thrash the id:revision cache used for materials assigned to the model. */
export async function buildMaterialUncached(material: CustomMaterial): Promise<THREE.MeshStandardMaterial> {
  const mat = new THREE.MeshStandardMaterial({
    name: material.name,
    color: new THREE.Color(material.baseColor),
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    transparent: material.transparent || material.opacity < 1,
  })

  const maps: Array<Promise<void>> = []

  if (material.diffuseMap) {
    maps.push(
      loadTexture(material.diffuseMap, THREE.SRGBColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.map = tex
      }),
    )
  }

  if (material.bumpMapType === 'bump' && material.bumpNormalMap) {
    maps.push(
      loadTexture(material.bumpNormalMap, THREE.NoColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.bumpMap = tex
        mat.bumpScale = material.bumpScale
        mat.normalMap = null
      }),
    )
  } else if (material.bumpMapType === 'normal' && material.bumpNormalMap) {
    maps.push(
      loadTexture(material.bumpNormalMap, THREE.NoColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.normalMap = tex
        mat.normalScale = new THREE.Vector2(material.normalScale, material.normalScale)
        mat.bumpMap = null
      }),
    )
  }

  if (material.roughnessMap) {
    maps.push(
      loadTexture(material.roughnessMap, THREE.NoColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.roughnessMap = tex
      }),
    )
  }
  if (material.metalnessMap) {
    maps.push(
      loadTexture(material.metalnessMap, THREE.NoColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.metalnessMap = tex
      }),
    )
  }
  if (material.aoMap) {
    maps.push(
      loadTexture(material.aoMap, THREE.NoColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.aoMap = tex
      }),
    )
  }
  if (material.emissiveMap) {
    maps.push(
      loadTexture(material.emissiveMap, THREE.SRGBColorSpace).then((tex) => {
        applyUvTransform(tex, material)
        mat.emissiveMap = tex
      }),
    )
  }
  if (material.emissiveIntensity > 0) {
    mat.emissive = new THREE.Color(material.emissiveColor)
    mat.emissiveIntensity = material.emissiveIntensity
  }

  await Promise.all(maps)
  mat.needsUpdate = true
  return mat
}

/** Builds (or returns a cached) THREE.MeshStandardMaterial for a saved material, keyed by
 * id:revision so an edit invalidates stale instances without leaking GPU resources on every
 * intermediate save. Used for materials assigned to the model. */
export async function buildThreeMaterial(material: CustomMaterial): Promise<THREE.MeshStandardMaterial> {
  const cacheKey = `${material.id}:${material.revision}`
  const cached = materialCache.get(cacheKey)
  if (cached) return cached

  const mat = await buildMaterialUncached(material)

  // Evict any older revision of this same material id.
  for (const key of materialCache.keys()) {
    if (key.startsWith(`${material.id}:`) && key !== cacheKey) {
      materialCache.get(key)?.dispose()
      materialCache.delete(key)
    }
  }
  materialCache.set(cacheKey, mat)
  return mat
}

export function invalidateMaterialCache(materialId: string) {
  for (const key of materialCache.keys()) {
    if (key.startsWith(`${materialId}:`)) {
      materialCache.get(key)?.dispose()
      materialCache.delete(key)
    }
  }
}

export function clearMaterialCache() {
  for (const mat of materialCache.values()) mat.dispose()
  materialCache.clear()
}
