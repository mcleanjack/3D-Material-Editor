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
