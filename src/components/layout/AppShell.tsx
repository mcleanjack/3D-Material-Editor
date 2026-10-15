import { useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftToolRail } from './LeftToolRail'
import { RightPanelDock } from './RightPanelDock'
import { StatusBar } from './StatusBar'
import { Viewport } from '../viewport/Viewport'
import { useMaterialLibraryStore } from '../../store/useMaterialLibraryStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useAppStore } from '../../store/useAppStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

export function AppShell() {
  const loadMaterials = useMaterialLibraryStore((s) => s.loadAll)
  const loadProjects = useProjectStore((s) => s.loadAll)

  useEffect(() => {
    void loadMaterials()
    void loadProjects()
  }, [loadMaterials, loadProjects])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      const { undo, redo } = useAppStore.getState()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-full w-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftToolRail />
        <div className="relative min-w-0 flex-1">
          <Viewport />
        </div>
        <RightPanelDock />
      </div>
      <StatusBar />
    </div>
  )
}
