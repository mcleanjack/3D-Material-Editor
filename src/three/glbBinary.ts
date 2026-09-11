/**
 * Low-level binary-glTF (.glb) container helpers.
 *
 * THREE.GLTFExporter has no option to set root-level `extras` on the glTF JSON itself — only
 * per-object `userData` -> `extras`, via the normal node export path. Root-level metadata (the
 * build-stages summary — see exportGlb.ts) is instead added by parsing the already-exported
 * GLB's JSON chunk, merging the extra data into its top-level `extras`, and re-packing the
 * container. Kept isolated here so the chunk-alignment/padding math doesn't clutter the export
 * flow, and so it's independently testable.
 */

const GLB_MAGIC = 'glTF'
const JSON_CHUNK_TYPE = 'JSON'

/** Merges `extras` into the root-level `extras` of an already-exported binary GLB (creating it
 * if absent) and returns a new ArrayBuffer; the BIN chunk (geometry/texture data) is copied
 * through untouched. GLTFLoader surfaces root-level `extras` as `gltf.userData` on load — the
 * same userData<->extras convention already used for per-node data throughout this app. */
export function injectGlbRootExtras(buffer: ArrayBuffer, extras: Record<string, unknown>): ArrayBuffer {
  const dv = new DataView(buffer)
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4))
  if (magic !== GLB_MAGIC) throw new Error('injectGlbRootExtras: input is not a binary GLB')

  const jsonChunkLength = dv.getUint32(12, true)
  const jsonChunkType = new TextDecoder().decode(new Uint8Array(buffer, 16, 4))
  if (jsonChunkType !== JSON_CHUNK_TYPE) throw new Error('injectGlbRootExtras: first GLB chunk is not JSON')

  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLength)))
  json.extras = { ...(json.extras ?? {}), ...extras }

  let newJsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const paddedLength = Math.ceil(newJsonBytes.length / 4) * 4
  if (paddedLength > newJsonBytes.length) {
    // glTF requires chunk data to be 4-byte aligned; the JSON chunk is padded with ASCII spaces.
    const padded = new Uint8Array(paddedLength)
    padded.set(newJsonBytes)
    padded.fill(0x20, newJsonBytes.length)
    newJsonBytes = padded
  }

  const oldChunkDataStart = 20
  const remainder = new Uint8Array(buffer, oldChunkDataStart + jsonChunkLength)

  const totalLength = 12 + 8 + newJsonBytes.length + remainder.length
  const out = new ArrayBuffer(totalLength)
  const outBytes = new Uint8Array(out)
  const outDv = new DataView(out)

  outBytes.set(new Uint8Array(buffer, 0, 12), 0) // header: magic + version, copied as-is
  outDv.setUint32(8, totalLength, true) // total length, recomputed
  outDv.setUint32(12, newJsonBytes.length, true) // JSON chunk length, recomputed
  outBytes.set(new Uint8Array(buffer, 16, 4), 16) // "JSON" chunk type, unchanged
  outBytes.set(newJsonBytes, 20)
  outBytes.set(remainder, 20 + newJsonBytes.length)

  return out
}
