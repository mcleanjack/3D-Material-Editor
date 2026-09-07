/**
 * Main-thread entry point for the optional "Optimize export" pass. The actual glTF-Transform
 * pipeline (dedup/weld/prune/meshopt/KTX2) runs in a dedicated Web Worker — see
 * glbOptimize.worker.ts — so a 300MB export doesn't freeze the UI thread while it compresses.
 *
 * This only ever runs on the already-exported GLB `Blob` from exportGlb(); it never touches the
 * live editor scene.
 */

export type OptimizeStage =
  | 'reading'
  | 'dedup'
  | 'weld'
  | 'prune'
  | 'geometry-compress'
  | 'texture-compress'
  | 'writing'

export interface OptimizeGlbOptions {
  compressTextures: boolean
  onProgress?: (stage: OptimizeStage) => void
}

export interface OptimizeGlbResult {
  blob: Blob
  originalByteLength: number
  optimizedByteLength: number
}

type WorkerRequest = { type: 'optimize'; glb: ArrayBuffer; compressTextures: boolean }

type WorkerResponse =
  | { type: 'progress'; stage: OptimizeStage }
  | { type: 'done'; glb: ArrayBuffer }
  | { type: 'error'; message: string }

/** Runs the optimization pipeline on `blob` in a Worker and resolves with the compressed copy.
 * The input blob (the editor's normal export output) is left untouched. */
export async function optimizeGlb(blob: Blob, { compressTextures, onProgress }: OptimizeGlbOptions): Promise<OptimizeGlbResult> {
  const originalByteLength = blob.size
  const glb = await blob.arrayBuffer()

  const worker = new Worker(new URL('./glbOptimize.worker.ts', import.meta.url), { type: 'module' })

  try {
    return await new Promise<OptimizeGlbResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data
        if (msg.type === 'progress') {
          onProgress?.(msg.stage)
        } else if (msg.type === 'done') {
          resolve({
            blob: new Blob([msg.glb], { type: 'model/gltf-binary' }),
            originalByteLength,
            optimizedByteLength: msg.glb.byteLength,
          })
        } else {
          reject(new Error(msg.message))
        }
      }
      worker.onerror = (e) => reject(new Error(e.message || 'GLB optimization worker failed'))

      const request: WorkerRequest = { type: 'optimize', glb, compressTextures }
      worker.postMessage(request, [glb])
    })
  } finally {
    worker.terminate()
  }
}
