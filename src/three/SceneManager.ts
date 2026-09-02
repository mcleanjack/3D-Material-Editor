import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { COMPONENT_ID_KEY } from '../types/scene'

export type ProjectionMode = 'perspective' | 'orthographic'

const SELECTION_COLOR = 0x3b82f6
const HOVER_COLOR = 0xf59e0b

export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly perspectiveCamera: THREE.PerspectiveCamera
  readonly orthographicCamera: THREE.OrthographicCamera
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  readonly renderer: THREE.WebGLRenderer
  controls: OrbitControls

  readonly modelGroup = new THREE.Group()
  readonly edgesGroup = new THREE.Group()
  private readonly selectionHelpers = new THREE.Group()
  private readonly hoverHelpers = new THREE.Group()
  private readonly grid: THREE.GridHelper
  private readonly axes: THREE.AxesHelper

  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private rafId = 0
  private wireframe = false

  constructor() {
    this.scene.background = new THREE.Color(0x2b2d33)
    this.modelGroup.name = 'ImportedModel'
    this.edgesGroup.name = 'ComponentEdgesPreview'
    this.scene.add(this.modelGroup, this.edgesGroup, this.selectionHelpers, this.hoverHelpers)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.1)
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(5, 10, 7.5)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-6, 4, -6)
    this.scene.add(hemi, key, fill)

    this.grid = new THREE.GridHelper(20, 20, 0x555862, 0x3a3d45)
    this.axes = new THREE.AxesHelper(1.5)
    this.scene.add(this.grid, this.axes)

    this.perspectiveCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000)
    this.perspectiveCamera.position.set(4, 3, 6)
    this.orthographicCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.01, 5000)
    this.orthographicCamera.position.set(4, 3, 6)
    this.camera = this.perspectiveCamera

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.target.set(0, 0.5, 0)
  }

  mount(container: HTMLElement) {
    this.container = container
    container.appendChild(this.renderer.domElement)
    this.handleResize()
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
    this.loop()
  }

  dispose() {
    cancelAnimationFrame(this.rafId)
    this.resizeObserver?.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private handleResize() {
    if (!this.container) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)

    this.perspectiveCamera.aspect = w / h
    this.perspectiveCamera.updateProjectionMatrix()

    const aspect = w / h
    const viewSize = this.orthoViewSize
    this.orthographicCamera.left = (-viewSize * aspect) / 2
    this.orthographicCamera.right = (viewSize * aspect) / 2
    this.orthographicCamera.top = viewSize / 2
    this.orthographicCamera.bottom = -viewSize / 2
    this.orthographicCamera.updateProjectionMatrix()
  }

  private orthoViewSize = 10

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  setProjection(mode: ProjectionMode) {
    const prevCamera = this.camera
    this.camera = mode === 'perspective' ? this.perspectiveCamera : this.orthographicCamera
    this.camera.position.copy(prevCamera.position)
    this.controls.object = this.camera
    this.handleResize()
  }

  setModel(root: THREE.Group | null) {
    this.modelGroup.clear()
    if (root) this.modelGroup.add(root)
  }

  setWireframe(enabled: boolean) {
    this.wireframe = enabled
    this.modelGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial
        if ('wireframe' in std) std.wireframe = enabled
      }
    })
  }

  isWireframe() {
    return this.wireframe
  }

  fitToScreen(target: THREE.Object3D = this.modelGroup) {
    const box = new THREE.Box3().setFromObject(target)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1

    this.controls.target.copy(center)

    const fov = this.perspectiveCamera.fov * (Math.PI / 180)
    const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.6
    const dir = new THREE.Vector3(1, 0.7, 1).normalize()
    this.perspectiveCamera.position.copy(center).addScaledVector(dir, distance)
    this.perspectiveCamera.near = Math.max(distance / 100, 0.01)
    this.perspectiveCamera.far = distance * 100
    this.perspectiveCamera.updateProjectionMatrix()

    this.orthoViewSize = maxDim * 1.6
    this.orthographicCamera.position.copy(center).addScaledVector(dir, distance)
    this.handleResize()

    this.grid.position.y = box.min.y
  }

  resetCamera() {
    this.fitToScreen()
  }

  raycastAtNdc(ndcX: number, ndcY: number): THREE.Object3D | null {
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const hits = raycaster.intersectObject(this.modelGroup, true)
    if (hits.length === 0) return null
    return hits[0].object
  }

  /** Walks up from a raycast hit to find the node carrying a componentId (should be immediate,
   * since every imported node is stamped, but this stays robust if geometry gets re-parented). */
  static findComponentId(obj: THREE.Object3D | null): string | null {
    let cur: THREE.Object3D | null = obj
    while (cur) {
      const id = cur.userData[COMPONENT_ID_KEY]
      if (id) return id
      cur = cur.parent
    }
    return null
  }

  findObjectByComponentId(componentId: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    this.modelGroup.traverse((obj) => {
      if (found) return
      if (obj.userData[COMPONENT_ID_KEY] === componentId) found = obj
    })
    return found
  }

  setSelection(componentIds: string[]) {
    this.selectionHelpers.clear()
    for (const id of componentIds) {
      const obj = this.findObjectByComponentId(id)
      if (!obj) continue
      const helper = new THREE.BoxHelper(obj, SELECTION_COLOR)
      const mat = helper.material as THREE.LineBasicMaterial
      mat.depthTest = false
      mat.transparent = true
      helper.renderOrder = 999
      helper.update()
      this.selectionHelpers.add(helper)
    }
  }

  setHover(componentId: string | null) {
    this.hoverHelpers.clear()
    if (!componentId) return
    const obj = this.findObjectByComponentId(componentId)
    if (!obj) return
    const helper = new THREE.BoxHelper(obj, HOVER_COLOR)
    const mat = helper.material as THREE.LineBasicMaterial
    mat.depthTest = false
    mat.transparent = true
    mat.opacity = 0.6
    helper.update()
    this.hoverHelpers.add(helper)
  }

  setGridVisible(visible: boolean) {
    this.grid.visible = visible
  }

  setAxesVisible(visible: boolean) {
    this.axes.visible = visible
  }
}
