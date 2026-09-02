import type { EdgeSettings, ExportSettings } from './scene'
import type { TreeFolder } from './folder'
import type { SunSettings } from './sun'

/** A saved authoring session. The source FBX itself is NOT re-embedded here — only a
 * reference/name — because it can be large; the user re-imports the same FBX to resume. */
export interface AuthoringProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number

  sourceFbxName: string

  /** componentId -> assigned custom material id */
  materialAssignments: Record<string, string>
  /** componentId -> canonical face index -> assigned custom material id */
  faceMaterialAssignments: Record<string, Record<number, string>>
  /** componentId -> visible */
  visibility: Record<string, boolean>

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
