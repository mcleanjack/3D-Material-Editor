import type { EdgeSettings, ExportSettings } from './scene'

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
  /** componentId -> visible */
  visibility: Record<string, boolean>

  edgeSettings: EdgeSettings
  exportSettings: ExportSettings

  camera: {
    position: [number, number, number]
    target: [number, number, number]
  } | null
}
