export interface ObjectTreeNode {
  componentId: string
  name: string
  isMesh: boolean
  children: ObjectTreeNode[]
}

/** Returns a new tree with the given node's name changed, rebuilding only the path from the
 * root down to that node (siblings elsewhere in the tree keep their existing object identity). */
export function renameNodeInTree(root: ObjectTreeNode, componentId: string, name: string): ObjectTreeNode {
  if (root.componentId === componentId) return { ...root, name }
  if (root.children.length === 0) return root
  let changed = false
  const children = root.children.map((child) => {
    const next = renameNodeInTree(child, componentId, name)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...root, children } : root
}

/** Same idea as renameNodeInTree but for many componentIds at once (e.g. restoring every rename
 * a saved project recorded after re-importing its source FBX) — one tree walk instead of one per
 * name. componentIds absent from `names` keep their current name. */
export function renameNodesInTree(root: ObjectTreeNode, names: Record<string, string>): ObjectTreeNode {
  const nextName = names[root.componentId]
  const renamed = nextName !== undefined && nextName !== root.name ? { ...root, name: nextName } : root
  if (renamed.children.length === 0) return renamed
  let changed = renamed !== root
  const children = renamed.children.map((child) => {
    const next = renameNodesInTree(child, names)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...renamed, children } : renamed
}
