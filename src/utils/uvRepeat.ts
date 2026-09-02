/**
 * Converts a material's physical pattern size (mm) into a THREE.Texture.repeat value.
 *
 * Convention: scene units are meters (the glTF/three.js standard, and what GLTFExporter
 * assumes on export), and a mesh's default 0..1 UV tile is treated as spanning exactly one
 * scene unit (1m) — the standard "world-space tiling" assumption used when the source FBX
 * doesn't carry real-world UV distances. Under that convention, a texture whose physical
 * pattern repeats every `physicalWidthMm` should be tiled `1000 / physicalWidthMm` times per
 * UV unit, which is exactly `Texture.repeat`.
 */
export function physicalSizeToRepeat(physicalWidthMm: number, physicalHeightMm: number): [number, number] {
  const w = Math.max(physicalWidthMm, 0.001)
  const h = Math.max(physicalHeightMm, 0.001)
  return [1000 / w, 1000 / h]
}
