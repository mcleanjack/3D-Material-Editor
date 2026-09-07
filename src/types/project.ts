import type { EdgeSettings, ExportSettings } from './scene'
import type { TreeFolder } from './folder'
import type { SunSettings } from './sun'
import type { ProductInfo } from './product'

/** A saved authoring session. The in-browser "Save Project"/"Open Project" list keys resume on
 * `sourceFbxName` alone — the user re-imports the same-named FBX and assignments reapply to it
 * (see useProjectStore.loadProject). `sourceFbxAssetId` exists only so the *file-based* "Save to
 * File" export (src/utils/projectFile.ts) can also bundle the FBX's actual bytes, making that
 * export genuinely self-contained; it points at the blob asset cached when the FBX was imported
 * (see useAppStore.importFbxFile) and is optional both for backward compatibility with projects
 * saved before this existed and because no FBX may be loaded yet when a project is saved. */
export interface AuthoringProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number

  sourceFbxName: string
  sourceFbxAssetId?: string

  /** componentId -> assigned custom material id */
  materialAssignments: Record<string, string>
  /** componentId -> canonical face index -> assigned custom material id */
  faceMaterialAssignments: Record<string, Record<number, string>>
  /** componentId -> visible */
  visibility: Record<string, boolean>
  /** componentId -> product/supplier metadata (see src/types/product.ts) — independent of
   * material assignment, face-level material groups, and component edges. Optional for backward
   * compatibility with projects saved before this feature existed. */
  productInfo?: Record<string, ProductInfo>

  /** Object Tree folder-grouping layer (see src/types/folder.ts) — an authoring-tool
   * organizational layer only, never written into GLB export. Optional for backward
   * compatibility with projects saved before this feature existed. */
  folders?: Record<string, TreeFolder>
  /** componentId -> id of the folder directly containing it. */
  folderMembership?: Record<string, string>

  edgeSettings: EdgeSettings
  exportSettings: ExportSettings
  /** Viewport-only sun/shadow preview (see src/types/sun.ts) — deliberately kept as its own
   * field, separate from material/export data. Optional for backward compatibility with
   * projects saved before this feature existed. */
  sunSettings?: SunSettings

  camera: {
    position: [number, number, number]
    target: [number, number, number]
  } | null
}
