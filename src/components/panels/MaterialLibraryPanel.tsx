import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useMaterialLibraryStore } from '../../store/useMaterialLibraryStore'
import type { CustomMaterial } from '../../types/material'
import { Icon } from '../common/Icon'
import { Button } from '../common/Button'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { PanelShell } from './PanelShell'

function MaterialCard({ material, onEdit }: { material: CustomMaterial; onEdit: () => void }) {
  const duplicateMaterial = useMaterialLibraryStore((s) => s.duplicateMaterial)
  const deleteMaterial = useMaterialLibraryStore((s) => s.deleteMaterial)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const usage = useAppStore((s) => Object.values(s.materialAssignments).filter((id) => id === material.id).length)

  async function handleDelete() {
    await deleteMaterial(material.id)
    setConfirmDelete(false)
  }

  return (
    <div className="group relative rounded-md border border-[var(--panel-border)] bg-[#24262c] p-2">
      <button className="block w-full text-left" onClick={onEdit}>
        <div
          className="mb-1.5 h-20 w-full rounded bg-[#1a1b1f] bg-cover bg-center"
          style={{
            backgroundImage: material.thumbnailDataUrl ? `url(${material.thumbnailDataUrl})` : undefined,
            backgroundColor: material.thumbnailDataUrl ? undefined : material.baseColor,
          }}
        />
        <div className="truncate text-xs font-medium text-[var(--text)]">{material.name}</div>
        <div className="truncate text-[10px] text-[var(--text-faint)]">{material.category}</div>
      </button>

      <div className="mt-1.5 flex items-center justify-between">
        {usage > 0 ? (
          <span className="text-[10px] text-[var(--text-faint)]">Used ×{usage}</span>
        ) : (
          <span className="text-[10px] text-[var(--text-faint)]">Unused</span>
        )}
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button title="Edit" className="rounded p-1 text-[var(--text-dim)] hover:bg-white/10" onClick={onEdit}>
            <Icon name="edit" size={12} />
          </button>
          <button
            title="Duplicate"
            className="rounded p-1 text-[var(--text-dim)] hover:bg-white/10"
            onClick={() => void duplicateMaterial(material.id)}
          >
            <Icon name="copy" size={12} />
          </button>
          <button
            title="Delete"
            className="rounded p-1 text-[var(--text-dim)] hover:bg-red-500/20 hover:text-red-400"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      {confirmDelete && usage === 0 && (
        <ConfirmDialog
          title={`Delete "${material.name}"?`}
          message="This cannot be undone."
          confirmLabel="DELETE"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
        />
      )}
      {confirmDelete && usage > 0 && (
        <ConfirmDialog
          title={`"${material.name}" is in use`}
          message={`This material is currently used by ${usage} object${usage > 1 ? 's' : ''} in the loaded model. Deleting it will not affect any GLB you've already exported, but objects using it here will fall back to their original FBX material.`}
          confirmLabel="DELETE ANYWAY"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}

export function MaterialLibraryPanel() {
  const materials = useMaterialLibraryStore((s) => s.materials)
  const setActiveRightPanel = useAppStore((s) => s.setActiveRightPanel)
  const openMaterialEditor = useAppStore((s) => s.openMaterialEditor)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('All')

  const categories = useMemo(() => ['All', ...Array.from(new Set(materials.map((m) => m.category))).sort()], [materials])

  const filtered = materials.filter((m) => {
    if (category !== 'All' && m.category !== category) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.manufacturer.toLowerCase().includes(q)
  })

  return (
    <PanelShell
      title="Custom Material Library"
      onClose={() => setActiveRightPanel(null)}
      headerExtra={
        <button
          title="Create Material"
          className="rounded p-1 text-blue-400 hover:bg-white/10"
          onClick={() => openMaterialEditor(null)}
        >
          <Icon name="plus" size={14} />
        </button>
      }
    >
      {materials.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 px-6 text-center">
          <Icon name="material" size={28} className="text-[var(--text-faint)]" />
          <p className="text-xs text-[var(--text-dim)]">Your Material Library is empty.</p>
          <p className="text-[11px] text-[var(--text-faint)]">Create your first custom material</p>
          <Button variant="primary" icon={<Icon name="plus" size={14} />} onClick={() => openMaterialEditor(null)}>
            CREATE MATERIAL
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b px-3 py-2" style={{ borderColor: 'var(--panel-border)' }}>
            <div className="flex items-center gap-1.5 rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1">
              <Icon name="search" size={12} className="text-[var(--text-faint)]" />
              <input
                className="w-full bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                placeholder="Search materials…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="w-full rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1 text-xs text-[var(--text)]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              className="w-full justify-center"
              icon={<Icon name="plus" size={14} />}
              onClick={() => openMaterialEditor(null)}
            >
              CREATE MATERIAL
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 p-2">
            {filtered.map((m) => (
              <MaterialCard key={m.id} material={m} onEdit={() => openMaterialEditor(m.id)} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-[var(--text-faint)]">No materials match your search.</p>
          )}
        </>
      )}
    </PanelShell>
  )
}
