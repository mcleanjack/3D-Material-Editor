/** A UI/metadata-only grouping node in the Object Tree panel. Folders never touch the live
 * Three.js scene graph, the FBX-derived hierarchy, or GLB export — see `folderMembership` in
 * the app store for how objects are associated with a folder. */
export interface TreeFolder {
  id: string
  name: string
  /** Containing folder id, or null for a top-level folder. */
  parentId: string | null
}
