import { dbDeleteAsset, dbGetAsset, dbPutAsset } from './db'
import { makeId } from '../utils/id'

/** Caches object URLs for asset blobs so the same PNG isn't re-read from IDB repeatedly,
 * and so callers can synchronously get a <img>/texture-loadable URL after the first fetch. */
const urlCache = new Map<string, string>()
const blobCache = new Map<string, Blob>()

export async function storeTextureFile(file: File | Blob): Promise<string> {
  const assetId = makeId('asset')
  await dbPutAsset(assetId, file)
  blobCache.set(assetId, file)
  return assetId
}

export async function getAssetUrl(assetId: string): Promise<string> {
  const cached = urlCache.get(assetId)
  if (cached) return cached
  const blob = blobCache.get(assetId) ?? (await dbGetAsset(assetId))
  if (!blob) throw new Error(`Asset ${assetId} not found`)
  blobCache.set(assetId, blob)
  const url = URL.createObjectURL(blob)
  urlCache.set(assetId, url)
  return url
}

export async function getAssetBlob(assetId: string): Promise<Blob> {
  const cached = blobCache.get(assetId)
  if (cached) return cached
  const blob = await dbGetAsset(assetId)
  if (!blob) throw new Error(`Asset ${assetId} not found`)
  blobCache.set(assetId, blob)
  return blob
}

export async function deleteAsset(assetId: string): Promise<void> {
  const url = urlCache.get(assetId)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(assetId)
  blobCache.delete(assetId)
  await dbDeleteAsset(assetId)
}

export async function readImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('Could not read image dimensions'))
      img.src = url
    })
    return dims
  } finally {
    URL.revokeObjectURL(url)
  }
}
