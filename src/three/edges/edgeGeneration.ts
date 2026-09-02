import * as THREE from 'three'

interface CacheEntry {
  angleThreshold: number
  geometry: THREE.EdgesGeometry
}

/** EdgesGeometry per source geometry, keyed by geometry.uuid + angle threshold. EdgesGeometry
 * only keeps silhouette/boundary edges and edges whose adjacent faces meet at >= the threshold
 * angle, so coplanar triangulation seams within a face are dropped automatically — this is what
 * keeps per-component outlines clean instead of showing raw mesh topology. */
const cache = new Map<string, CacheEntry>()

export function getEdgesGeometry(geometry: THREE.BufferGeometry, angleThreshold: number): THREE.EdgesGeometry {
  const key = geometry.uuid
  const existing = cache.get(key)
  if (existing && existing.angleThreshold === angleThreshold) {
    return existing.geometry
  }
  existing?.geometry.dispose()
  const edges = new THREE.EdgesGeometry(geometry, angleThreshold)
  cache.set(key, { angleThreshold, geometry: edges })
  return edges
}

export function clearEdgesCacheForGeometry(geometryUuid: string) {
  const existing = cache.get(geometryUuid)
  if (existing) {
    existing.geometry.dispose()
    cache.delete(geometryUuid)
  }
}

export function clearAllEdgesCache() {
  for (const entry of cache.values()) entry.geometry.dispose()
  cache.clear()
}
