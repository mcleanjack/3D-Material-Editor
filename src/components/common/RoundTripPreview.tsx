import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Renders an already-loaded GLTFLoader scene (the exported-then-reloaded GLB) in its own small
 * viewport with orbit controls, so "reload and visually compare" is an actual look at the
 * round-tripped result — including the exported __COMPONENT_EDGES__ geometry exactly as a
 * downstream Three.js viewer would draw it — not just the numeric validation report.
 */
export function RoundTripPreview({ scene: loadedScene }: { scene: THREE.Group }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1b1f)
    scene.add(loadedScene)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.1)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(5, 10, 7.5)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-6, 4, -6)
    scene.add(hemi, key, fill)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    const box = new THREE.Box3().setFromObject(loadedScene)
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const distance = (maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.6
      controls.target.copy(center)
      camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.7, 1).normalize(), distance)
      camera.near = Math.max(distance / 100, 0.01)
      camera.far = distance * 100
      camera.updateProjectionMatrix()
    }

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedScene])

  return <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
}
