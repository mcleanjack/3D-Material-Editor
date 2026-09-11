/** A linked PDF construction detail, stored as a blob asset in IndexedDB and referenced by id —
 * same pattern as `TextureMapRef` in src/types/material.ts. Never holds the file bytes itself;
 * see src/db/assetCache.ts for the blob store. */
export interface LinkedDetailRef {
  assetId: string
  fileName: string
  fileSize: number
  mimeType: string
}

/** Above this size, attaching a linked detail shows a non-blocking warning (matches the
 * look-like-a-URL/email checks below: advisory only, never blocks Save). */
export const LINKED_DETAIL_WARN_BYTES = 20 * 1024 * 1024

/** Per-component product/supplier metadata, authored independently of material assignment,
 * face-level material groups, and component edges — editing one never touches the others.
 * Every text field is optional free text; an object with nothing filled in and no linked detail
 * behaves exactly as it did before this feature existed (see isProductInfoEmpty). Embedded into
 * GLB export as `node.userData.productInfo` (glTF `extras.productInfo` — see
 * src/three/exportGlb.ts), and exportable on its own as a CSV product schedule (see
 * src/utils/exportProductInfo.ts). */
export interface ProductInfo {
  description: string
  installationManualUrl: string
  productPageUrl: string
  supplierName: string
  contactName: string
  phone: string
  email: string
  /** A linked PDF construction detail (see LinkedDetailRef) — one per object. */
  linkedDetail: LinkedDetailRef | null
}

export const EMPTY_PRODUCT_INFO: ProductInfo = {
  description: '',
  installationManualUrl: '',
  productPageUrl: '',
  supplierName: '',
  contactName: '',
  phone: '',
  email: '',
  linkedDetail: null,
}

export function isProductInfoEmpty(info: ProductInfo): boolean {
  return (
    info.linkedDetail === null &&
    info.description.trim() === '' &&
    info.installationManualUrl.trim() === '' &&
    info.productPageUrl.trim() === '' &&
    info.supplierName.trim() === '' &&
    info.contactName.trim() === '' &&
    info.phone.trim() === '' &&
    info.email.trim() === ''
  )
}

/** Lightweight, non-blocking "does this look like a URL" check — missing `http(s)://` is the
 * one thing worth flagging; anything else is left alone since a pasted-and-fixed-later value is
 * an explicitly supported flow (see spec: validation must never block Save). */
export function looksLikeUrl(value: string): boolean {
  if (value.trim() === '') return true
  return /^https?:\/\/.+/i.test(value.trim())
}

export function looksLikeEmail(value: string): boolean {
  if (value.trim() === '') return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
