import { useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { exportGlb, downloadBlob } from '../../three/exportGlb'
import { optimizeGlb, type OptimizeStage } from '../../three/glbOptimize'
import { validateGlb, type GlbValidationReport } from '../../three/reimportValidate'
import { downloadProductInfoCsv } from '../../utils/exportProductInfo'
import { exportProjectToFile, importProjectFromFile } from '../../utils/projectFile'
import { Icon } from '../common/Icon'
import { Button } from '../common/Button'
import { ExportReportModal, type OptimizeSizeInfo } from '../common/ExportReportModal'
import { OpenProjectModal } from '../common/OpenProjectModal'

const OPTIMIZE_STAGE_LABELS: Record<OptimizeStage, string> = {
  reading: 'READING…',
  dedup: 'DEDUPLICATING…',
  weld: 'WELDING VERTICES…',
  prune: 'PRUNING UNUSED DATA…',
  'geometry-compress': 'COMPRESSING GEOMETRY…',
  'texture-compress': 'COMPRESSING TEXTURES…',
  writing: 'WRITING FILE…',
}

export function TopBar() {
  const fbxInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [optimizeExport, setOptimizeExport] = useState(false)
  const [optimizeStage, setOptimizeStage] = useState<OptimizeStage | null>(null)
  const [report, setReport] = useState<{ report: GlbValidationReport; fileName: string; sizeInfo?: OptimizeSizeInfo } | null>(null)
  const [showOpenProject, setShowOpenProject] = useState(false)

  const importFbxFile = useAppStore((s) => s.importFbxFile)
  const importing = useAppStore((s) => s.importing)
  const fbxFileName = useAppStore((s) => s.fbxFileName)
  const modelRoot = useAppStore((s) => s.modelRoot)
  const sceneManager = useAppStore((s) => s.sceneManager)
  const edgeSettings = useAppStore((s) => s.edgeSettings)
  const exportSettings = useAppStore((s) => s.exportSettings)
  const productInfo = useAppStore((s) => s.productInfo)
  const objectMeta = useAppStore((s) => s.objectMeta)
  const folders = useAppStore((s) => s.folders)
  const folderMembership = useAppStore((s) => s.folderMembership)
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

  function handleExportProductInfo() {
    const baseName = (fbxFileName ?? 'model').replace(/\.fbx$/i, '')
    downloadProductInfoCsv(productInfo, objectMeta, `${baseName}-product-info.csv`)
    setStatusMessage(`Exported product information for ${Object.keys(productInfo).length} object(s).`)
  }

  async function handleSaveToFile() {
    setStatusMessage('Saving project to file…')
    try {
      await exportProjectToFile()
      setStatusMessage('Project saved to file.')
    } catch (err) {
      setStatusMessage(`Failed to save project file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleOpenFromFile() {
    setStatusMessage('Opening project file…')
    await importProjectFromFile()
  }

  async function handleExport() {
    if (!modelRoot || !sceneManager) return
    setExporting(true)
    setOptimizeStage(null)
    setStatusMessage('Exporting GLB…')
    try {
      const baseName = (fbxFileName ?? 'model').replace(/\.fbx$/i, '')
      let blob = await exportGlb({
        modelGroup: sceneManager.modelGroup,
        exportSettings,
        edgeSettings,
        folders,
        folderMembership,
      })

      let sizeInfo: OptimizeSizeInfo | undefined
      if (optimizeExport) {
        const result = await optimizeGlb(blob, {
          compressTextures: exportSettings.includeTextures,
          onProgress: setOptimizeStage,
        })
        blob = result.blob
        sizeInfo = { originalBytes: result.originalByteLength, optimizedBytes: result.optimizedByteLength }
        setOptimizeStage(null)
      }

      downloadBlob(blob, `${baseName}.glb`)

      setStatusMessage('Validating exported GLB…')
      const validation = await validateGlb(blob, sceneManager.renderer)
      setReport({ report: validation, fileName: `${baseName}.glb`, sizeInfo })
      setStatusMessage(`Exported ${baseName}.glb — ${validation.meshCount} meshes, ${validation.materialCount} materials.`)
    } catch (err) {
      setStatusMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
      setOptimizeStage(null)
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
              <MenuItem
                icon="import"
                label="Import FBX…"
                onClick={() => {
                  fbxInputRef.current?.click()
                  setMenuOpen(false)
                }}
              />
              <MenuItem
                icon="export"
                label="Export GLB…"
                disabled={!modelRoot}
                onClick={() => {
                  void handleExport()
                  setMenuOpen(false)
                }}
              />
              <MenuItem
                icon="export"
                label="Export Product Information (CSV)…"
                disabled={Object.keys(productInfo).length === 0}
                onClick={() => {
                  handleExportProductInfo()
                  setMenuOpen(false)
                }}
              />
              <div className="my-1 h-px bg-[var(--panel-border)]" />
              <MenuItem
                icon="save"
                label="Save Project"
                onClick={() => {
                  void saveCurrentAsProject()
                  setMenuOpen(false)
                }}
              />
              <MenuItem
                icon="folder"
                label="Open Project…"
                onClick={() => {
                  setShowOpenProject(true)
                  setMenuOpen(false)
                }}
              />
              <MenuItem
                icon="save"
                label="Save to File…"
                onClick={() => {
                  void handleSaveToFile()
                  setMenuOpen(false)
                }}
              />
              <MenuItem
                icon="folder"
                label="Open from File…"
                onClick={() => {
                  void handleOpenFromFile()
                  setMenuOpen(false)
                }}
              />
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
      <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
        <input
          type="checkbox"
          checked={optimizeExport}
          onChange={(e) => setOptimizeExport(e.target.checked)}
          disabled={exporting}
        />
        Optimize export
      </label>
      <Button
        variant="primary"
        icon={<Icon name="export" size={14} />}
        onClick={() => void handleExport()}
        disabled={!modelRoot || exporting}
      >
        {optimizeStage ? OPTIMIZE_STAGE_LABELS[optimizeStage] : exporting ? 'EXPORTING…' : 'EXPORT GLB'}
      </Button>

      {report && (
        <ExportReportModal
          report={report.report}
          fileName={report.fileName}
          sizeInfo={report.sizeInfo}
          onClose={() => setReport(null)}
        />
      )}
      {showOpenProject && <OpenProjectModal onClose={() => setShowOpenProject(false)} />}
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
