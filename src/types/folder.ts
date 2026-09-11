/** A UI/metadata-only grouping node in the Object Tree panel. Folders never touch the live
 * Three.js scene graph, the FBX-derived hierarchy, or GLB export — see `folderMembership` in
 * the app store for how objects are associated with a folder. */
export interface TreeFolder {
  id: string
  name: string
  /** Containing folder id, or null for a top-level folder. */
  parentId: string | null
  /** When set, this folder represents a construction/assembly stage for downstream staged
   * playback (see src/three/exportGlb.ts) — opt-in per folder, so a folder can stay purely
   * organizational (no stage) alongside ones that represent a build stage. The number controls
   * playback order (1, 2, 3…); duplicates aren't prevented, but the editor's own reorder
   * controls (moveBuildStageOrder in useAppStore) always keep them a contiguous, unique
   * sequence. */
  buildStageOrder?: number
}

/** All componentIds contained by a folder, including via nested subfolders. Pure/read-only —
 * used both by store actions (visibility, selection) and by the tree UI (indicator state). */
export function collectFolderComponentIds(
  folders: Record<string, TreeFolder>,
  folderMembership: Record<string, string>,
  folderId: string,
): string[] {
  const ids: string[] = []
  for (const [componentId, fid] of Object.entries(folderMembership)) {
    if (fid === folderId) ids.push(componentId)
  }
  for (const folder of Object.values(folders)) {
    if (folder.parentId === folderId) ids.push(...collectFolderComponentIds(folders, folderMembership, folder.id))
  }
  return ids
}

/** Every folder marked as a build stage, ordered by its stage number ascending. */
export function getBuildStageFolders(folders: Record<string, TreeFolder>): TreeFolder[] {
  return Object.values(folders)
    .filter((f) => f.buildStageOrder !== undefined)
    .sort((a, b) => a.buildStageOrder! - b.buildStageOrder!)
}

/** Resolves each grouped componentId to the *nearest* enclosing build-stage folder (walking up
 * through parentId), not just any folder it happens to sit under — so a plain organizational
 * subfolder nested inside a build-stage folder still inherits that stage, while a more specific
 * build-stage folder nested inside a broader one takes precedence for its own objects. Objects
 * that were never grouped into any folder at all are never staged, matching the spec: "objects
 * not in any build-stage folder should simply have no stage metadata." */
export function resolveBuildStageAssignments(
  folders: Record<string, TreeFolder>,
  folderMembership: Record<string, string>,
): Map<string, TreeFolder> {
  const result = new Map<string, TreeFolder>()
  for (const componentId of Object.keys(folderMembership)) {
    let folderId: string | null = folderMembership[componentId]
    while (folderId) {
      const folder: TreeFolder | undefined = folders[folderId]
      if (!folder) break
      if (folder.buildStageOrder !== undefined) {
        result.set(componentId, folder)
        break
      }
      folderId = folder.parentId
    }
  }
  return result
}
