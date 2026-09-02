# 3D Material Editor

A browser-based material authoring tool for construction-detail models: import an FBX exported
from Revit, build a private library of custom PBR materials from your own PNG textures, assign
them to model components, configure a clean component-edge outline, and export a self-contained
GLB for use in a downstream Three.js viewer.

Everything runs client-side. The FBX/GLB never leaves the browser; materials and textures are
stored locally in IndexedDB.

## Workflow

```
Import FBX → identify objects & original FBX materials → create custom materials
(diffuse PNG + optional bump/normal PNG + PBR settings + physical texture size)
→ assign materials to objects → configure Component Edge display → Export GLB
(embeds only the materials actually used, plus a __COMPONENT_EDGES__ mesh)
```

The custom material library starts empty — there are no built-in/default materials. Everything
in it is something you created.

Materials can be assigned per object (or per group, cascading to every mesh inside it) or per
face: switch to the **Face Select** tool to click, shift-click, or shift-drag (marquee) a set of
triangles on one object and assign a material to just that selection — the rest of the object
keeps its own material. A face override can be reset back to the object's base material without
touching any other face.

## Running it

```bash
npm install
npm run dev       # dev server
npm run build     # production build (tsc + vite build) → dist/
npm run preview   # serve the production build locally
npm run lint       # oxlint
```

## Notable implementation choices

- **Materials**: `THREE.MeshStandardMaterial`. UV `repeat` is derived from each material's
  physical width/height (mm) rather than requiring manual UV math — see
  `src/utils/uvRepeat.ts`.
- **Component edges**: per-object `THREE.EdgesGeometry` with an adjustable angle threshold, so
  only real component boundaries/creases show — not raw mesh triangulation. The live viewport
  uses `LineSegments2`/`LineMaterial` ("fat lines") for correct screen-space line width; GLB
  export instead bakes real, exportable tube geometry into a dedicated `__COMPONENT_EDGES__`
  mesh, since fat-line shaders don't survive a glTF round-trip (see `src/three/edges/`).
- **Material assignment** targets a componentId that can be a group or a leaf mesh; assignment
  resolves to the nearest ancestor with an explicit assignment, so assigning to a whole component
  group cascades to every mesh inside it.
- **componentId** is derived deterministically from each node's hierarchy path + name (not a
  random id), so re-importing the same FBX reproduces the same ids and a saved project's material
  assignments still resolve after reopening it.
- **Storage**: materials, their PNG assets, and authoring projects are persisted in IndexedDB
  (`src/db/`). Deleting a material never affects a GLB you've already exported (materials are
  embedded, not referenced), only future exports/imports of the assignment.
- **Export**: `GLTFExporter` runs against a cloned scene graph (geometry is shared, not deep
  cloned) so export-only settings (materials/textures on-off) never touch the live editor state.
  Skinned meshes are cloned with `SkeletonUtils.clone` rather than a plain `Object3D.clone`, which
  otherwise leaves a `SkinnedMesh`'s skeleton pointing at the original (non-cloned) bones.
- **Face-level material assignment** (`src/three/faceMaterials.ts`): every imported mesh keeps its
  untouched original geometry as `userData.canonicalGeometry`; all face indices in app state
  (selection, saved assignments) are relative to that canonical face order, which never changes.
  Assigning a material to a face selection reorders a *derived* geometry so same-material faces
  are contiguous, adds one `BufferGeometry.group` per material, and sets `mesh.material` to the
  matching array — the standard three.js/glTF multi-material representation, so it needs no
  special-casing on export (`GLTFExporter` already emits one glTF primitive per group) or import.
  A mapping from the derived geometry's (reordered) face indices back to canonical ones lets
  raycast hits — including the marquee tool's per-face occlusion test — resolve correctly no
  matter how many times a mesh has been re-split. Objects with no face override never have their
  geometry touched at all.

## Testing notes

The full workflow (create material → import FBX → assign material incl. group-level cascade and
per-face overrides via click/shift-click/marquee → reset a face override back to base → configure
edges → export GLB → reload via `GLTFLoader` and validate mesh/material/edge/multi-material-split
counts) was exercised end-to-end in a real Chromium browser, with zero console errors. No
Revit-exported FBX was available in this environment, so the FBX import/hierarchy/material path
was validated against a real, non-Revit binary FBX (three.js's own "Samba Dancing" sample) instead
— it exercises the same `FBXLoader` parsing path (hierarchy, named materials, transforms, and —
usefully for the face-material work — a genuinely dense, real-world triangle count) that a Revit
export would, but a Revit file should still be used to confirm Revit-specific conventions
(family/type naming, units) before relying on this in production.

One thing not separately exercised live: face-level assignments persisting through a full project
save → reload cycle. The save/load code path is a direct extension of the already-tested
whole-object `materialAssignments` handling (same IndexedDB project record, one more field), but
it's worth a manual check before depending on it.
