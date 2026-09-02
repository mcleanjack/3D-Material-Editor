import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { COMPONENT_ID_KEY, type ObjectMeta } from '../types/scene'
import type { ObjectTreeNode } from '../types/tree'

export interface FbxImportResult {
  root: THREE.Group
  objectMeta: Map<string, ObjectMeta>
  fbxMaterialNames: string[]
  tree: ObjectTreeNode
}

function collectMaterialNames(mesh: THREE.Mesh): string[] {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return mats.filter(Boolean).map((m) => m.name || 'Unnamed Material')
}

/**
 * Loads an FBX file, preserving its object hierarchy, names and transforms as-is (no
 * flattening/re-parenting). Stamps a stable componentId onto every node so material
 * assignments, visibility and edge caches can survive re-renders and project save/load.
 */
export async function importFbx(file: File): Promise<FbxImportResult> {
  const buffer = await file.arrayBuffer()
  const loader = new FBXLoader()
  const root = loader.parse(buffer, '') as THREE.Group

  if (!root.name) root.name = file.name.replace(/\.fbx$/i, '')

  const objectMeta = new Map<string, ObjectMeta>()
  const materialNameSet = new Set<string>()

  // Deterministic ids (hierarchy path + name), not random uuids: re-importing the same FBX
  // must reproduce the same componentIds so a saved project's material assignments still
  // resolve to the right objects after the file is re-imported.
  function visit(obj: THREE.Object3D, path: string): ObjectTreeNode {
    const componentId = `${path}::${obj.name || 'node'}`
    obj.userData[COMPONENT_ID_KEY] = componentId

    const isMesh = (obj as THREE.Mesh).isMesh === true
    let fbxMaterialNames: string[] = []
    if (isMesh) {
      const mesh = obj as THREE.Mesh
      mesh.userData.originalMaterial = mesh.material
      fbxMaterialNames = collectMaterialNames(mesh)
      fbxMaterialNames.forEach((n) => materialNameSet.add(n))
    }

    objectMeta.set(componentId, {
      componentId,
      name: obj.name || (isMesh ? 'Mesh' : 'Group'),
      fbxMaterialNames,
      assignedMaterialId: null,
      visible: obj.visible,
      isMesh,
    })

    return {
      componentId,
      name: obj.name || (isMesh ? 'Mesh' : 'Group'),
      isMesh,
      children: obj.children.map((child, i) => visit(child, `${path}.${i}`)),
    }
  }

  const tree = visit(root, '0')

  return {
    root,
    objectMeta,
    fbxMaterialNames: Array.from(materialNameSet).sort(),
    tree,
  }
}
