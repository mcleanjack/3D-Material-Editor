import { create } from 'zustand'
import type { AuthoringProject } from '../types/project'
import { DEFAULT_SUN_SETTINGS } from '../types/sun'
import { dbDeleteProject, dbGetAllProjects, dbPutProject } from '../db/db'
import { makeId } from '../utils/id'
import { useAppStore } from './useAppStore'

interface ProjectState {
  projects: AuthoringProject[]
  currentProjectId: string | null
  currentProjectName: string
  saveStatus: 'saved' | 'unsaved' | 'saving'
  loadAll: () => Promise<void>
  saveCurrentAsProject: (name?: string) => Promise<void>
  loadProject: (id: string) => void
  deleteProject: (id: string) => Promise<void>
  markDirty: () => void
  setCurrentProjectName: (name: string) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  currentProjectName: 'Untitled Project',
  saveStatus: 'unsaved',

  loadAll: async () => {
    const projects = await dbGetAllProjects()
    projects.sort((a, b) => b.updatedAt - a.updatedAt)
    set({ projects })
  },

  saveCurrentAsProject: async (name) => {
    set({ saveStatus: 'saving' })
    const app = useAppStore.getState()
    const id = get().currentProjectId ?? makeId('proj')
    const now = Date.now()
    const cam = app.sceneManager?.camera
    const project: AuthoringProject = {
      id,
      name: name ?? get().currentProjectName,
      createdAt: now,
      updatedAt: now,
      sourceFbxName: app.fbxFileName ?? '',
      materialAssignments: app.materialAssignments,
      productInfo: app.productInfo,
      faceMaterialAssignments: app.faceMaterialAssignments,
      visibility: Object.fromEntries(Array.from(app.objectMeta.keys()).map((k) => [k, !app.hiddenComponentIds.has(k)])),
      folders: app.folders,
      folderMembership: app.folderMembership,
      edgeSettings: app.edgeSettings,
      exportSettings: app.exportSettings,
      sunSettings: app.sunSettings,
      camera: cam
        ? {
            position: [cam.position.x, cam.position.y, cam.position.z],
            target: [app.sceneManager!.controls.target.x, app.sceneManager!.controls.target.y, app.sceneManager!.controls.target.z],
          }
        : null,
    }
    await dbPutProject(project)
    set((s) => ({
      currentProjectId: id,
      currentProjectName: project.name,
      saveStatus: 'saved',
      projects: [project, ...s.projects.filter((p) => p.id !== id)],
    }))
  },

  loadProject: (id) => {
    const project = get().projects.find((p) => p.id === id)
    if (!project) return
    const app = useAppStore.getState()

    app.setEdgeSettings(project.edgeSettings)
    app.setExportSettings(project.exportSettings)
    app.setSunSettings(project.sunSettings ?? DEFAULT_SUN_SETTINGS)

    if (app.fbxFileName === project.sourceFbxName && app.modelRoot) {
      // Same source already loaded — reapply assignments/visibility directly.
      useAppStore.setState({
        materialAssignments: project.materialAssignments,
        productInfo: project.productInfo ?? {},
        faceMaterialAssignments: project.faceMaterialAssignments ?? {},
        hiddenComponentIds: new Set(
          Object.entries(project.visibility)
            .filter(([, visible]) => !visible)
            .map(([id]) => id),
        ),
        folders: project.folders ?? {},
        folderMembership: project.folderMembership ?? {},
      })
      void app.reapplyAllAssignments()
      app.reapplyProductInfo()
    }

    if (project.camera && app.sceneManager) {
      app.sceneManager.camera.position.set(...project.camera.position)
      app.sceneManager.controls.target.set(...project.camera.target)
    }

    set({ currentProjectId: id, currentProjectName: project.name, saveStatus: 'saved' })
    app.setStatusMessage(
      app.fbxFileName === project.sourceFbxName
        ? `Loaded project "${project.name}".`
        : `Loaded project "${project.name}" — re-import "${project.sourceFbxName}" to restore material assignments.`,
    )
  },

  deleteProject: async (id) => {
    await dbDeleteProject(id)
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  },

  markDirty: () => set({ saveStatus: 'unsaved' }),
  setCurrentProjectName: (name) => set({ currentProjectName: name, saveStatus: 'unsaved' }),
}))
