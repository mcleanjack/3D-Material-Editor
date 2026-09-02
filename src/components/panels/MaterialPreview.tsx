import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { CustomMaterial } from '../../types/material'
import { buildMaterialUncached } from '../../three/materialFactory'

/** Self-contained live preview: sphere on a turntable, showing the draft material exactly as
 * it will render on the model (diffuse, bump/normal, roughness, metalness) — rebuilt on every
 * field change since this is unsaved-draft state that must never touch the shared material
 * cache used for assigned materials. */
export function MaterialPreview({ material, shape = 'sphere' }: { material: CustomMaterial; shape?: 'sphere' | 'cube' }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const autoRotate = useRef(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1b1f)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(0, 0, 3.2)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.2)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 4, 4)
    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-3, -1, 2)
    scene.add(hemi, key, fill)

    const geo = new THREE.SphereGeometry(1, 64, 64)
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x888888 }))
    meshRef.current = mesh
    scene.add(mesh)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (autoRotate.current) mesh.rotation.y += 0.006
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
      renderer.dispose()
      renderer.domElement.remove()
      geo.dispose()
    }
  }, [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const newGeo = shape === 'cube' ? new THREE.BoxGeometry(1.3, 1.3, 1.3, 4, 4, 4) : new THREE.SphereGeometry(1, 64, 64)
    const oldGeo = mesh.geometry
    mesh.geometry = newGeo
    oldGeo.dispose()
  }, [shape])

  useEffect(() => {
    let cancelled = false
    void buildMaterialUncached(material).then((mat) => {
      if (cancelled) return
      const mesh = meshRef.current
      if (!mesh) return
      const old = mesh.material as THREE.Material
      mesh.material = mat
      old.dispose()
    })
    return () => {
      cancelled = true
    }
  }, [material])

  function handlePointerDown(e: React.PointerEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY }
    autoRotate.current = false
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const mesh = meshRef.current
    if (!drag || !mesh) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    mesh.rotation.y += dx * 0.01
    mesh.rotation.x += dy * 0.01
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  function handlePointerUp() {
    dragRef.current = null
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={() => (autoRotate.current = true)}
    />
  )
}

/** Renders one frame off-screen and returns a small PNG data URL, for use as a library thumbnail. */
export async function captureMaterialThumbnail(material: CustomMaterial, size = 160): Promise<string> {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1b1f)
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, 3.2)
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setSize(size, size)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.2)
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(3, 4, 4)
  scene.add(hemi, key)

  const geo = new THREE.SphereGeometry(1, 48, 48)
  const mat = await buildMaterialUncached(material)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.y = 0.6
  scene.add(mesh)

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')

  geo.dispose()
  mat.dispose()
  renderer.dispose()
  return url
}
