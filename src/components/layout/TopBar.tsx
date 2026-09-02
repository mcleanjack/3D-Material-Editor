import { useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { exportGlb, downloadBlob } from '../../three/exportGlb'
import { validateGlb, type GlbValidationReport } from '../../three/reimportValidate'
import { Icon } from '../common/Icon'
import { Button } from '../common/Button'
import { ExportReportModal } from '../common/ExportReportModal'

export function TopBar() {
  const fbxInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [report, setReport] = useState<{ report: GlbValidationReport; fileName: string } | null>(null)

  const importFbxFile = useAppStore((s) => s.importFbxFile)
  const importing = useAppStore((s) => s.importing)
  const fbxFileName = useAppStore((s) => s.fbxFileName)
  const modelRoot = useAppStore((s) => s.modelRoot)
  const sceneManager = useAppStore((s) => s.sceneManager)
  const edgeSettings = useAppStore((s) => s.edgeSettings)
  const exportSettings = useAppStore((s) => s.exportSettings)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const projectName = useProjectStore((s) => s.currentProjectName)
  const saveStatus = useProjectStore((s) => s.saveStatus)
  const setCurrentProjectName = useProjectStore((s) => s.setCurrentProjectName)
  const saveCurrentAsProject = useProjectStore((s) => s.saveCurrentAsProject)

  function handleFbxChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void importFbxFile(file)
    e.target.value = ''
  }

  async function handleExport() {
    if (!modelRoot || !sceneManager) return
    setExporting(true)
    setStatusMessage('Exporting GLB…')
    try {
      const baseName = (fbxFileName ?? 'model').replace(/\.fbx$/i, '')
      const blob = await exportGlb({
        modelGroup: sceneManager.modelGroup,
        exportSettings,
        edgeSettings,
      })
      downloadBlob(blob, `${baseName}.glb`)

      setStatusMessage('Validating exported GLB…')
      const validation = await validateGlb(blob)
      setReport({ report: validation, fileName: `${baseName}.glb` })
      setStatusMessage(`Exported ${baseName}.glb — ${validation.meshCount} meshes, ${validation.materialCount} materials.`)
    } catch (err) {
      setStatusMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="flex h-11 shrink-0 items-center gap-3 border-b px-3 text-[13px]"
      style={{ background: 'var(--topbar-bg)', borderColor: 'var(--panel-border)' }}
    >
      <div className="relative">
        <button
          className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-white/5"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="font-semibold tracking-wide text-[var(--text)]">Material Editor</span>
          <Icon name="chevronDown" size={12} className="text-[var(--text-dim)]" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-md border border-[var(--panel-border)] bg-[var(--panel-bg)] py-1 shadow-xl">
              <MenuItem icon="import" label="Import FBX…" onClick={() => fbxInputRef.current?.click()} />
              <MenuItem
                icon="export"
                label="Export GLB…"
                disabled={!modelRoot}
                onClick={() => void handleExport()}
              />
              <div className="my-1 h-px bg-[var(--panel-border)]" />
              <MenuItem icon="save" label="Save Project" onClick={() => void saveCurrentAsProject()} />
              <MenuItem icon="folder" label="Open Project…" onClick={() => useAppStore.getState().setActiveRightPanel('objectTree')} />
            </div>
          </>
        )}
      </div>

      <input
        ref={fbxInputRef}
        type="file"
        accept=".fbx"
        className="hidden"
        onChange={handleFbxChosen}
      />

      <div className="h-5 w-px bg-[var(--panel-border)]" />

      <input
        className="w-52 rounded bg-transparent px-1.5 py-1 text-[var(--text)] outline-none hover:bg-white/5 focus:bg-white/5"
        value={projectName}
        onChange={(e) => setCurrentProjectName(e.target.value)}
      />
      <span className="text-[11px] text-[var(--text-faint)]">
        {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved changes'}
      </span>

      <div className="flex-1" />

      {fbxFileName && <span className="truncate text-[11px] text-[var(--text-dim)]">{fbxFileName}</span>}

      <Button
        variant="secondary"
        icon={<Icon name="import" size={14} />}
        onClick={() => fbxInputRef.current?.click()}
        disabled={importing}
      >
        {importing ? 'IMPORTING…' : 'IMPORT FBX'}
      </Button>
      <Button
        variant="primary"
        icon={<Icon name="export" size={14} />}
        onClick={() => void handleExport()}
        disabled={!modelRoot || exporting}
      >
        {exporting ? 'EXPORTING…' : 'EXPORT GLB'}
      </Button>

      {report && <ExportReportModal report={report.report} fileName={report.fileName} onClose={() => setReport(null)} />}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-white/5 disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={14} className="text-[var(--text-dim)]" />
      {label}
    </button>
  )
}
