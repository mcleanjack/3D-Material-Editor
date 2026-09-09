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

/** Returns a new tree with every node whose componentId is in `componentIds` removed, wherever
 * in the tree it appears (its own children, if any, go with it). Used when several objects are
 * merged into one and their original tree nodes no longer correspond to anything in the scene. */
export function removeNodesFromTree(root: ObjectTreeNode, componentIds: ReadonlySet<string>): ObjectTreeNode {
  const children = root.children.filter((c) => !componentIds.has(c.componentId)).map((c) => removeNodesFromTree(c, componentIds))
  return { ...root, children }
}
