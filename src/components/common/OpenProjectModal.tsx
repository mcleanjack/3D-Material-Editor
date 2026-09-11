import { useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'

export function OpenProjectModal({ onClose }: { onClose: () => void }) {
  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const loadProject = useProjectStore((s) => s.loadProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function handleOpen(id: string) {
    loadProject(id)
    onClose()
  }

  const deleteTarget = projects.find((p) => p.id === confirmDeleteId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">Open Project</h3>
          <button className="rounded p-1 text-[var(--text-dim)] hover:bg-white/10" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Icon name="folder" size={22} className="text-[var(--text-faint)]" />
            <p className="text-xs text-[var(--text-dim)]">No saved projects yet.</p>
          </div>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-2 rounded border p-2 ${
                  p.id === currentProjectId ? 'border-blue-500 bg-blue-600/10' : 'border-[var(--panel-border)] hover:bg-white/5'
                }`}
              >
                <button className="min-w-0 flex-1 text-left" onClick={() => handleOpen(p.id)}>
                  <div className="truncate text-xs font-medium text-[var(--text)]">{p.name}</div>
                  <div className="truncate text-[10px] text-[var(--text-faint)]">
                    {p.sourceFbxName || 'No FBX imported'} — {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  title="Delete project"
                  className="shrink-0 rounded p-1 text-[var(--text-dim)] opacity-0 hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                  onClick={() => setConfirmDeleteId(p.id)}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.name}"?`}
          message="This cannot be undone."
          confirmLabel="DELETE"
          danger
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            void deleteProject(deleteTarget.id)
            setConfirmDeleteId(null)
          }}
        />
      )}
    </div>
  )
}
