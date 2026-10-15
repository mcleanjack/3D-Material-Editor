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

/** A stable identity for one edge segment, derived from its own (local-space) endpoint
 * positions rather than its position in the generated array — so a specific physical edge keeps
 * the same key across re-generation (e.g. after an angle-threshold change re-includes/excludes
 * other edges and shifts everyone else's array index). Rounded to 4 decimal places (±0.1mm at
 * meter scale) to tolerate floating-point noise, and endpoint-order-independent (the two ends are
 * compared and sorted) so it doesn't matter which end EdgesGeometry happened to list first. */
export function edgeSegmentKey(ax: number, ay: number, az: number, bx: number, by: number, bz: number): string {
  const round = (n: number) => (Math.round(n * 1e4) / 1e4).toFixed(4)
  const a = `${round(ax)},${round(ay)},${round(az)}`
  const b = `${round(bx)},${round(by)},${round(bz)}`
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

