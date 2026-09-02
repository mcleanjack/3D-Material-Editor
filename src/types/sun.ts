/** Viewport-only "sun" lighting/shadow preview. Purely a live-editor review aid: it is never
 * embedded into GLB export (no KHR_lights_punctual node is added — export only ever clones the
 * imported model's own subtree, see three/exportGlb.ts) and never touches material data (colour,
 * roughness, metalness, bump strength, ...) — only how the scene is lit and shadowed for the
 * author's own review. Kept as its own project field (see AuthoringProject.sunSettings),
 * deliberately separate from material/export data even though it's optionally saved with a
 * project. */
export interface SunSettings {
  enabled: boolean
  /** Degrees, 0-360. Horizontal direction the sun is coming from. */
  azimuth: number
  /** Degrees, 0-90. Sun height above the horizon; drives shadow length/angle. */
  elevation: number
  intensity: number
  /** Independent of `enabled` — lets the sun light the scene without casting shadows. */
  shadowsEnabled: boolean
  /** 0 (hard-edged) .. 10 (soft/blurred); maps to DirectionalLight.shadow.radius. */
  shadowSoftness: number
}

export const DEFAULT_SUN_SETTINGS: SunSettings = {
  enabled: false,
  azimuth: 135,
  elevation: 45,
  intensity: 3,
  shadowsEnabled: true,
  shadowSoftness: 3,
}
