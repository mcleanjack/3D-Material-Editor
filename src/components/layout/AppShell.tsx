import { useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftToolRail } from './LeftToolRail'
import { RightPanelDock } from './RightPanelDock'
import { StatusBar } from './StatusBar'
import { Viewport } from '../viewport/Viewport'
import { useMaterialLibraryStore } from '../../store/useMaterialLibraryStore'
import { useProjectStore } from '../../store/useProjectStore'

export function AppShell() {
  const loadMaterials = useMaterialLibraryStore((s) => s.loadAll)
  const loadProjects = useProjectStore((s) => s.loadAll)

  useEffect(() => {
    void loadMaterials()
    void loadProjects()
  }, [loadMaterials, loadProjects])

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
