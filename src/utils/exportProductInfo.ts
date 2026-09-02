import type { ObjectMeta } from '../types/scene'
import type { ProductInfo } from '../types/product'
import { isProductInfoEmpty } from '../types/product'
import { downloadBlob } from '../three/exportGlb'

const COLUMNS = [
  'Object Name',
  'Description',
  'Installation Manual URL',
  'Product Page URL',
  'Supplier Name',
  'Contact Name',
  'Phone',
  'Email',
] as const

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Independent of GLB export — a product schedule the author can generate any time, listing
 * only components that actually have product information filled in (no blank rows for
 * undocumented components). */
export function buildProductInfoCsv(productInfo: Record<string, ProductInfo>, objectMeta: Map<string, ObjectMeta>): string {
  const rows: string[][] = [[...COLUMNS]]
  for (const [componentId, info] of Object.entries(productInfo)) {
    if (isProductInfoEmpty(info)) continue
    const name = objectMeta.get(componentId)?.name ?? componentId
    rows.push([
      name,
      info.description,
      info.installationManualUrl,
      info.productPageUrl,
      info.supplierName,
      info.contactName,
      info.phone,
      info.email,
    ])
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

export function downloadProductInfoCsv(productInfo: Record<string, ProductInfo>, objectMeta: Map<string, ObjectMeta>, fileName: string) {
  const csv = buildProductInfoCsv(productInfo, objectMeta)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, fileName)
}
