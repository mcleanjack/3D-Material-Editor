import { useEffect, useRef, useState } from 'react'
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
  const selectFace = useAppStore((s) => s.selectFace)
  const addFacesToSelection = useAppStore((s) => s.addFacesToSelection)
  const clearFaceSelection = useAppStore((s) => s.clearFaceSelection)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

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

  function pxFromEvent(e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerDownPos.current = { x: e.clientX, y: e.clientY }

    if (activeTool === 'faceSelect' && e.shiftKey) {
      const sm = sceneManagerRef.current
      if (sm) sm.controls.enabled = false
      marqueeStart.current = pxFromEvent(e)
      setMarqueeRect({ x0: marqueeStart.current.x, y0: marqueeStart.current.y, x1: marqueeStart.current.x, y1: marqueeStart.current.y })
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const down = pointerDownPos.current
    pointerDownPos.current = null
    const dragDist = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 0

    if (activeTool === 'faceSelect') {
      const sm = sceneManagerRef.current
      const marqueeActive = marqueeStart.current !== null

      if (marqueeActive && dragDist > 6) {
        // Completed drag: run the box-select.
        const start = marqueeStart.current!
        const end = pxFromEvent(e)
        marqueeStart.current = null
        setMarqueeRect(null)
        if (sm) {
          sm.controls.enabled = true
          const container = containerRef.current!
          const result = sm.pickFacesInRect(start.x, start.y, end.x, end.y, container.clientWidth, container.clientHeight)
          if (result?.tooDense) {
            setStatusMessage('Marquee select skipped — this mesh has too many faces to box-select.')
          } else if (result && result.faceIndices.length > 0) {
            addFacesToSelection(result.componentId, result.faceIndices)
          }
        }
        return
      }

      // Not a drag (or marquee never started): treat as a click, either toggling one face
      // (shift held) or replacing the selection.
      marqueeStart.current = null
      setMarqueeRect(null)
      if (sm) sm.controls.enabled = true
      if (dragDist > 4) return // camera drag, not a click
      if (!sm) return
      const { x, y } = ndcFromEvent(e)
      const hit = sm.raycastFaceAtNdc(x, y)
      if (hit) selectFace(hit.componentId, hit.canonicalFaceIndex, e.shiftKey)
      else if (!e.shiftKey) clearFaceSelection()
      return
    }

    if (activeTool !== 'select') return
    if (!down) return
    if (dragDist > 4) return // treat as a camera drag, not a click-select

    const sm = sceneManagerRef.current
    if (!sm) return
    const { x, y } = ndcFromEvent(e)
    const hit = sm.raycastAtNdc(x, y)
    const componentId = SceneManager.findComponentId(hit)
    selectComponent(componentId, e.shiftKey)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (marqueeStart.current) {
      const p = pxFromEvent(e)
      setMarqueeRect({ x0: marqueeStart.current.x, y0: marqueeStart.current.y, x1: p.x, y1: p.y })
      return
    }

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
    >
      {marqueeRect && (
        <div
          className="pointer-events-none absolute border border-dashed border-pink-400 bg-pink-400/15"
          style={{
            left: Math.min(marqueeRect.x0, marqueeRect.x1),
            top: Math.min(marqueeRect.y0, marqueeRect.y1),
            width: Math.abs(marqueeRect.x1 - marqueeRect.x0),
            height: Math.abs(marqueeRect.y1 - marqueeRect.y0),
          }}
        />
      )}
    </div>
  )
}
