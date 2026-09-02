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
- **Component edges**: per-object `THREE.EdgesGeometry` with an adjustable angle threshold (never
  on a merged/flattened scene — that would leak internal triangulation seams from adjacent objects
  once merged), so only real component boundaries/creases show, not raw mesh triangulation. The
  live viewport uses `LineSegments2`/`LineMaterial` ("fat lines") for correct screen-space line
  width; GLB export instead bakes real, exportable geometry into a dedicated `__COMPONENT_EDGES__`
  mesh (a flat double-sided ribbon per edge segment, 2 triangles — not a tube — since fat-line
  shaders don't survive a glTF round-trip and these are outlines viewed mostly straight-on, not
  cross-sectioned), merged into one `BufferGeometry`/draw call up front rather than one object per
  segment (see `src/three/edges/tubeEdges.ts`).
  - **Angle threshold is clamped to 15°–89°** (`MIN_EDGE_ANGLE_THRESHOLD`/`MAX_EDGE_ANGLE_THRESHOLD`
    in `src/types/scene.ts`, enforced centrally in `useAppStore.setEdgeSettings` — not just the
    slider — so a saved project can't reintroduce a bad value either). Below ~15°, `EdgesGeometry`
    starts treating near-coplanar triangulation seams *inside* an otherwise-flat face as real
    edges; measured on a ~55k-triangle test model, dropping the threshold to its old floor of 1°
    took raw edge segments from 1,890 to 67,169 (35x) — this was the dominant driver behind a
    reported 2.5M-triangle `__COMPONENT_EDGES__` export, well ahead of per-segment tessellation
    cost.
  - **Edge triangle budget**: edge-triangle count scales *linearly* with model complexity (raw
    segment count, verified with synthetic small/medium/large test scenes — no O(n²) behavior).
    The edge-to-base-triangle *ratio*, however, depends on how faceted the geometry is, not on
    model size: a dense/curved mesh has a low ratio (a ~55k-triangle test character: ~11% at the
    default 35° threshold) because most of its triangles are smooth-surface fill with few genuine
    sharp edges: a low-poly, box-like component (typical Revit framing/masonry members) has a
    *higher* ratio — a plain box has as many edges (12) as triangles (12), and each edge costs 2
    ribbon triangles, so simple boxy components alone can reach ~200% of their own triangle count.
    That's inherent to representing many genuinely distinct edges as real, line-weight-controllable
    geometry (glTF has no line-width concept, so a thinner primitive than a 2-triangle ribbon isn't
    an option without losing that control) — it is not a bug and isn't reducible further without
    dropping it. What *is* a regression signal: edge
    triangles growing faster than base triangles as the model grows, or exceeding roughly 2x a
    given object's own triangle count at a sane (≥15°) threshold.
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
  Embedded material count always tracks *distinct* materials actually assigned, not mesh count:
  when "Model Materials" or "Textures" is turned off for export, the substitute
  (neutral/texture-stripped) material is cached per distinct original material rather than
  rebuilt per mesh — many meshes sharing one assigned material (a whole wall of individually
  outlined bricks, say) still embed that material once, in every combination of those settings
  (verified live: 2 meshes sharing 1 material → 2 embedded materials — the shared one plus the
  edges material — with materials on, textures off, and materials off).
- **"Preview Round-Trip"** (in the export validation modal): renders the just-reloaded
  `GLTFLoader` scene in its own small viewport, so a claim that an export "round-tripped
  correctly" is something you can actually look at — including the exported
  `__COMPONENT_EDGES__` geometry exactly as a downstream Three.js viewer would draw it — not just
  a table of counts.
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

### Component-edge size fix (measured before/after)

A report of `__COMPONENT_EDGES__` reaching 2.5M triangles (~300MB export) on a real detail led to
two fixes, verified as follows rather than assumed:

- **Root cause, reproduced**: on a real ~55k-triangle test model, dragging the angle threshold to
  its old floor of 1° took raw edge segments from 1,890 to 67,169 (35x) and `__COMPONENT_EDGES__`
  from 15,120 to 537,352 triangles — with the old 8-triangle tube cross-section, that reproduces
  the same order of magnitude as the reported bug. The threshold is now clamped to 15°–89°
  everywhere (slider, and centrally in `setEdgeSettings` so a saved project can't reintroduce a
  low value) — 15° is now the worst case reachable, and it produces 35,726 triangles on that same
  model: comfortably in the "tens of thousands" range even at the new floor.
- **Tessellation cost, halved twice over**: the tube→ribbon change cuts triangles-per-edge from 8
  to 2 independent of segment count — confirmed exactly 4x on the same model at the default 35°
  threshold (15,120 → 3,780 triangles). Segments were already accumulated into one merged
  `BufferGeometry` before this fix (one draw call, not one geometry object per segment), so no
  change was needed there.
- **Linear scaling, confirmed with synthetic models**: `buildExportEdgesMesh` was run directly
  (no browser needed — it's pure geometry math) against three synthetic scenes of clearly
  different size — 24 objects/288 triangles, 600 objects/7,200 triangles, 3,040 objects/37,920
  triangles (boxes plus a batch of coarse cylinders, to also stress the angle threshold on curved
  surfaces) — at the default 35° threshold. Base-triangle growth and edge-triangle growth tracked
  almost exactly step to step (25.00x vs 25.00x, then 5.27x vs 5.13x): linear, not quadratic, with
  generation time scaling the same way (9ms → 42ms → 134ms).
- **Visual check, not assumed**: the reloaded export was inspected directly via the new "Preview
  Round-Trip" viewer at both normal and close zoom — ribbon edges read as clean, continuous
  outlines with no gaps, exactly matching the pre-fix appearance.
- See the "Component edges" bullet above for why the edge-to-base-triangle *ratio* varies by
  model (low for dense/curved geometry, higher for simple boxy components) rather than being one
  fixed target, and what to actually watch for as a regression signal.
