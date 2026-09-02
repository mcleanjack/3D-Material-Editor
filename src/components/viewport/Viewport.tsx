import { useEffect, useRef } from 'react'
import { SceneManager } from '../../three/SceneManager'
import { useAppStore } from '../../store/useAppStore'

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneManagerRef = useRef<SceneManager | null>(null)

  const initSceneManager = useAppStore((s) => s.initSceneManager)
  const selectComponent = useAppStore((s) => s.selectComponent)
  const setHover = useAppStore((s) => s.setHover)
  const edgePreview = useAppStore((s) => s.edgePreview)
  const activeTool = useAppStore((s) => s.activeTool)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const sm = new SceneManager()
    sceneManagerRef.current = sm
    sm.mount(container)
    initSceneManager(sm)

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      useAppStore.getState().edgePreview?.setResolution(w, h)
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      sm.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!edgePreview || !containerRef.current) return
    edgePreview.setResolution(containerRef.current.clientWidth, containerRef.current.clientHeight)
  }, [edgePreview])

  function ndcFromEvent(e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    return { x, y }
  }

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (activeTool !== 'select') return
    const down = pointerDownPos.current
    pointerDownPos.current = null
    if (!down) return
    const dragDist = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    if (dragDist > 4) return // treat as a camera drag, not a click-select

    const sm = sceneManagerRef.current
    if (!sm) return
    const { x, y } = ndcFromEvent(e)
    const hit = sm.raycastAtNdc(x, y)
    const componentId = SceneManager.findComponentId(hit)
    selectComponent(componentId, e.shiftKey)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const sm = sceneManagerRef.current
    if (!sm) return
    const { x, y } = ndcFromEvent(e)
    const hit = sm.raycastAtNdc(x, y)
    const componentId = SceneManager.findComponentId(hit)
    setHover(componentId)
  }

  function handlePointerLeave() {
    setHover(null)
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    />
  )
}
