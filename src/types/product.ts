/** Per-component product/supplier metadata, authored independently of material assignment,
 * face-level material groups, and component edges — editing one never touches the others.
 * Every field is optional free text; an object with nothing filled in behaves exactly as it did
 * before this feature existed (see isProductInfoEmpty). Embedded into GLB export as
 * `node.userData.productInfo` (glTF `extras.productInfo` — see src/three/exportGlb.ts), and
 * exportable on its own as a CSV product schedule (see src/utils/exportProductInfo.ts). */
export interface ProductInfo {
  description: string
  installationManualUrl: string
  productPageUrl: string
  supplierName: string
  contactName: string
  phone: string
  email: string
}

export const EMPTY_PRODUCT_INFO: ProductInfo = {
  description: '',
  installationManualUrl: '',
  productPageUrl: '',
  supplierName: '',
  contactName: '',
  phone: '',
  email: '',
}

export function isProductInfoEmpty(info: ProductInfo): boolean {
  return Object.values(info).every((v) => v.trim() === '')
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
