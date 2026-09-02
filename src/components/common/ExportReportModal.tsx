import { useState } from 'react'
import type { GlbValidationReport } from '../../three/reimportValidate'
import { Icon } from './Icon'
import { Button } from './Button'
import { RoundTripPreview } from './RoundTripPreview'

export function ExportReportModal({ report, fileName, onClose }: { report: GlbValidationReport; fileName: string; onClose: () => void }) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] p-4 shadow-xl"
        style={{ width: showPreview ? 640 : 384 }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Icon name="check" size={16} className="text-green-400" />
          <h3 className="text-sm font-semibold text-[var(--text)]">Exported &amp; validated {fileName}</h3>
        </div>
        <p className="mb-3 text-[11px] text-[var(--text-faint)]">
          The GLB was re-loaded with THREE.GLTFLoader (the same loader path a downstream viewer uses) to
          confirm what actually round-tripped.
        </p>

        <div className="flex gap-4">
          <dl className="mb-4 flex-1 space-y-1.5 text-xs">
            <Row label="Mesh objects" value={report.meshCount} />
            <Row label="Materials embedded" value={report.materialCount} />
            <Row label="Materials with textures" value={report.materialsWithTextures} />
            <Row
              label="__COMPONENT_EDGES__ object"
              value={report.hasEdgesObject ? `Present (${report.edgesTriangleCount.toLocaleString()} tris)` : 'Not included'}
            />
            <Row
              label="Multi-material (face-split) objects"
              value={
                report.multiMaterialObjectCount > 0
                  ? `${report.multiMaterialObjectCount} (${report.totalPrimitivesFromSplitObjects} material groups total)`
                  : 'None'
              }
            />
          </dl>

          {showPreview && (
            <div className="mb-4 h-56 w-56 shrink-0 overflow-hidden rounded border border-[var(--panel-border)]">
              <RoundTripPreview scene={report.scene} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'HIDE PREVIEW' : 'PREVIEW ROUND-TRIP'}
          </Button>
          <Button variant="primary" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b border-[var(--panel-border)]/50 py-1">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className="font-medium text-[var(--text)]">{value}</span>
    </div>
  )
}
