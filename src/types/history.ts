import type { EdgeSettings, ExportSettings } from './scene'
import type { TreeFolder } from './folder'
import type { SunSettings } from './sun'
import type { ProductInfo } from './product'

/** A snapshot of every piece of state that represents the user's authored content — the same
 * shape saved into an AuthoringProject, minus its project-level bookkeeping (id/name/timestamps/
 * camera/source file) that undo has no business touching. Pushed onto the undo stack before a
 * content-changing action runs; popped and reapplied by undo/redo (see useAppStore's
 * pushHistory/undo/redo/applyHistorySnapshot).
 *
 * Deliberately excludes viewport/UI-only state (selection, hover, active tool, camera, wireframe,
 * isolate mode, grid/axes visibility, which right panel is open) — undoing those would be
 * surprising (Ctrl+Z moving your selection instead of reverting your last edit) and none of it is
 * "content" by any definition that matters for a saved project or GLB export. */
export interface HistorySnapshot {
  materialAssignments: Record<string, string>
  faceMaterialAssignments: Record<string, Record<number, string>>
  productInfo: Record<string, ProductInfo>
  folders: Record<string, TreeFolder>
  folderMembership: Record<string, string>
  /** componentId -> display name, mirroring AuthoringProject.componentNames. */
  componentNames: Record<string, string>
  hiddenComponentIds: string[]
  hiddenEdgeComponentIds: string[]
  hiddenEdgeKeys: Record<string, string[]>
  edgeSettings: EdgeSettings
  exportSettings: ExportSettings
  sunSettings: SunSettings
}
