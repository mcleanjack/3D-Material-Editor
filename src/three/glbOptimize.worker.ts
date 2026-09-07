/**
 * Web Worker body for the "Optimize export" pipeline. Runs entirely off the main thread so a
 * large (up to ~300MB) GLB doesn't block the UI while it's being compressed.
 *
 * Pipeline, in order: dedup -> weld -> prune -> meshopt (geometry) -> KTX2 (textures, optional).
 * Deliberately does NOT run any instancing/mesh-joining transform (glTF-Transform's `instance()`
 * or `join()`): those collapse multiple nodes that share a mesh into one GPU-instanced node,
 * which would merge distinct objects together in the node graph. This app's object tree and
 * per-object Product Information are keyed by node identity (`extras.componentId`, stamped onto
 * each node's `userData` at FBX-import time and carried through export as glTF node `extras`), so
 * every original node must remain its own selectable glTF node after optimization.
 *
 * `prune` and `dedup` are node-safe by construction: `dedup`'s default propertyTypes are
 * Accessor/Mesh/Texture/Material/Skin (never Node), so it only relinks nodes to shared resources
 * without touching the nodes themselves; `prune` is told `keepExtras: true` and `keepLeaves: true`
 * so it never drops a node's extras or an empty-leaf node that a Product Info entry might target.
 */

import { Document, WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, prune, meshopt } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

// ktx2-encoder's browser/Node split is a `typeof window !== 'undefined'` check, which is false in
// a Worker (workers have no `window`, only `self`). Everything the browser codepath actually uses
// (OffscreenCanvas, createImageBitmap, fetch, WebAssembly) is available in a Worker, so this shim
// just needs to satisfy that one check — it never needs to behave like a real Window.
;(globalThis as unknown as { window: unknown }).window ??= self

type OptimizeStage = 'reading' | 'dedup' | 'weld' | 'prune' | 'geometry-compress' | 'texture-compress' | 'writing'

type WorkerRequest = { type: 'optimize'; glb: ArrayBuffer; compressTextures: boolean }

type WorkerResponse =
  | { type: 'progress'; stage: OptimizeStage }
  | { type: 'done'; glb: ArrayBuffer }
  | { type: 'error'; message: string }

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  postMessage(msg, transfer)
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { glb, compressTextures } = e.data
  try {
    const result = await optimize(glb, compressTextures)
    post({ type: 'done', glb: result }, [result])
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

async function optimize(glb: ArrayBuffer, compressTextures: boolean): Promise<ArrayBuffer> {
  post({ type: 'progress', stage: 'reading' })

  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])

  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    })

  const document: Document = await io.readBinary(new Uint8Array(glb))

  post({ type: 'progress', stage: 'dedup' })
  await document.transform(dedup())

  post({ type: 'progress', stage: 'weld' })
  await document.transform(weld())

  post({ type: 'progress', stage: 'prune' })
  await document.transform(
    prune({
      keepExtras: true,
      keepLeaves: true,
    }),
  )

  post({ type: 'progress', stage: 'geometry-compress' })
  // level: 'medium' keeps full attribute precision (position quantized to the default 14 bits —
  // visually lossless); 'high' clamps normals to 8 bits for extra compression, which is the
  // "most aggressive setting" this pipeline is explicitly avoiding.
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

  if (compressTextures && document.getRoot().listTextures().length > 0) {
    post({ type: 'progress', stage: 'texture-compress' })
    await compressTexturesToKtx2(document)
  }

  post({ type: 'progress', stage: 'writing' })
  const out = await io.writeBinary(document)
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}

/** Compresses material textures to KTX2/Basis Universal (UASTC — quality-first, not the smaller
 * but lossier ETC1S mode). Normal maps and linear (metallic/roughness/occlusion) maps are encoded
 * with different perceptual/sRGB/normal-map flags than color maps, since ktx2-encoder's transform
 * applies one flat options object to every texture it's given — so each slot group gets its own
 * pass, filtered by `slots`, rather than one pass with universally "safe" settings. */
async function compressTexturesToKtx2(document: Document) {
  const { ktx2 } = await import('ktx2-encoder/gltf-transform')

  const colorOptions = {
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
  }
  const linearOptions = {
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
  }
  const normalOptions = {
    ...linearOptions,
    isNormalMap: true,
  }

  await document.transform(ktx2({ ...colorOptions, slots: /^(baseColor|emissive)Texture$/ }))
  await document.transform(ktx2({ ...normalOptions, slots: /^normalTexture$/ }))
  await document.transform(ktx2({ ...linearOptions, slots: /^(metallicRoughness|occlusion)Texture$/ }))
  // Anything not on a recognized standard slot (e.g. a texture only referenced via an extension)
  // still gets compressed, using the same safe (non-perceptual) defaults as linear data.
  await document.transform(ktx2({ ...linearOptions, slots: /^(?!baseColor|emissive|normal|metallicRoughness|occlusion)/ }))
}
