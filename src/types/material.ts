/** A texture map stored as a blob asset in IndexedDB, referenced by id. */
export interface TextureMapRef {
  assetId: string
  fileName: string
  width: number
  height: number
}

export type BumpMapType = 'none' | 'bump' | 'normal'

export interface CustomMaterial {
  id: string
  /** Bumped on every save so consumers can tell whether cached GPU resources are stale. */
  revision: number
  createdAt: number
  updatedAt: number

  // Basic information
  name: string
  category: string
  manufacturer: string
  productName: string
  description: string
  materialId: string

  // Diffuse / base colour
  baseColor: string
  diffuseMap: TextureMapRef | null

  // Bump / normal
  bumpMapType: BumpMapType
  bumpNormalMap: TextureMapRef | null
  bumpScale: number
  normalScale: number

  // Optional PBR maps
  roughnessMap: TextureMapRef | null
  metalnessMap: TextureMapRef | null
  aoMap: TextureMapRef | null
  emissiveMap: TextureMapRef | null
  emissiveColor: string
  emissiveIntensity: number

  // PBR scalar properties
  roughness: number
  metalness: number
  opacity: number
  transparent: boolean

  // Physical texture scale (mm) — drives UV repeat, not raw repeat values
  physicalWidthMm: number
  physicalHeightMm: number

  // UV transform
  textureRotationDeg: number
  textureOffsetU: number
  textureOffsetV: number

  thumbnailDataUrl: string | null
}

export function createBlankMaterial(id: string, name: string): CustomMaterial {
  const now = Date.now()
  return {
    id,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    name,
    category: 'Uncategorised',
    manufacturer: '',
    productName: '',
    description: '',
    materialId: '',
    baseColor: '#b0b0b0',
    diffuseMap: null,
    bumpMapType: 'none',
    bumpNormalMap: null,
    bumpScale: 0.3,
    normalScale: 1,
    roughnessMap: null,
    metalnessMap: null,
    aoMap: null,
    emissiveMap: null,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
    roughness: 0.8,
    metalness: 0,
    opacity: 1,
    transparent: false,
    physicalWidthMm: 1000,
    physicalHeightMm: 1000,
    textureRotationDeg: 0,
    textureOffsetU: 0,
    textureOffsetV: 0,
    thumbnailDataUrl: null,
  }
}
