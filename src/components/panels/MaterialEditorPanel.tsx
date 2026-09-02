import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useMaterialLibraryStore } from '../../store/useMaterialLibraryStore'
import { createBlankMaterial, type CustomMaterial, type BumpMapType } from '../../types/material'
import { makeId } from '../../utils/id'
import { storeTextureFile, readImageDimensions, getAssetUrl } from '../../db/assetCache'
import { Icon } from '../common/Icon'
import { Button } from '../common/Button'
import { PanelShell } from './PanelShell'
import { MaterialPreview, captureMaterialThumbnail } from './MaterialPreview'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--text-dim)]">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-blue-500'

function TextureSlot({
  label,
  testId,
  assetId,
  fileName,
  onUpload,
  onClear,
}: {
  label: string
  testId: string
  assetId: string | undefined
  fileName: string | undefined
  onUpload: (file: File) => void
  onClear: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (assetId) {
      void getAssetUrl(assetId).then((url) => {
        if (!cancelled) setPreviewUrl(url)
      })
    } else {
      setPreviewUrl(null)
    }
    return () => {
      cancelled = true
    }
  }, [assetId])

  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-[var(--text-dim)]">{label}</span>
      <div className="flex items-center gap-2 rounded border border-dashed border-[var(--panel-border)] p-2">
        <div
          className="h-12 w-12 shrink-0 rounded bg-[#1a1b1f] bg-cover bg-center"
          style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : undefined }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-[var(--text)]">{fileName ?? 'No file selected'}</div>
          <div className="mt-1 flex gap-1.5">
            <label className="cursor-pointer rounded bg-[#33353d] px-2 py-0.5 text-[10px] text-[var(--text)] hover:bg-[#3d3f48]">
              {fileName ? 'Replace' : 'Upload PNG'}
              <input
                type="file"
                accept="image/png"
                aria-label={`Upload ${label}`}
                data-testid={testId}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onUpload(f)
                  e.target.value = ''
                }}
              />
            </label>
            {fileName && (
              <button className="rounded bg-[#33353d] px-2 py-0.5 text-[10px] text-red-400 hover:bg-[#3d3f48]" onClick={onClear}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--panel-border)' }}>
      <button className="mb-2 flex w-full items-center gap-1.5 text-left" onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={11} className="text-[var(--text-faint)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]">{title}</span>
      </button>
      {open && <div className="space-y-2.5">{children}</div>}
    </div>
  )
}

export function MaterialEditorPanel() {
  const editingMaterialId = useAppStore((s) => s.editingMaterialId)
  const closeMaterialEditor = useAppStore((s) => s.closeMaterialEditor)
  const getById = useMaterialLibraryStore((s) => s.getById)
  const saveMaterial = useMaterialLibraryStore((s) => s.saveMaterial)
  const materials = useMaterialLibraryStore((s) => s.materials)
  const reapplyAllAssignments = useAppStore((s) => s.reapplyAllAssignments)

  const isNew = editingMaterialId === null
  const existing = editingMaterialId ? getById(editingMaterialId) : undefined

  const [draft, setDraft] = useState<CustomMaterial>(() => existing ?? createBlankMaterial(makeId('mat'), 'New Material'))
  const [previewShape, setPreviewShape] = useState<'sphere' | 'cube'>('sphere')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(existing ?? createBlankMaterial(makeId('mat'), 'New Material'))
  }, [editingMaterialId, existing])

  const categories = useMemo(() => Array.from(new Set(materials.map((m) => m.category))).sort(), [materials])

  function update<K extends keyof CustomMaterial>(key: K, value: CustomMaterial[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function handleUpload(key: 'diffuseMap' | 'bumpNormalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap', file: File) {
    const dims = await readImageDimensions(file)
    const assetId = await storeTextureFile(file)
    update(key, { assetId, fileName: file.name, width: dims.width, height: dims.height })
    if (key === 'diffuseMap' && draft.physicalWidthMm === 1000 && draft.physicalHeightMm === 1000) {
      // Default the physical size to the pixel dimensions on first upload so repeat starts
      // sane (1px = 1mm) rather than at an arbitrary default; the user can override it.
      update('physicalWidthMm', dims.width)
      update('physicalHeightMm', dims.height)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const thumbnailDataUrl = await captureMaterialThumbnail(draft)
      const toSave = { ...draft, thumbnailDataUrl }
      await saveMaterial(toSave)
      await reapplyAllAssignments()
      closeMaterialEditor()
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelShell title={isNew ? 'Create Material' : 'Edit Material'} onClose={closeMaterialEditor}>
      <div className="border-b" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex h-40 items-stretch">
          <MaterialPreview material={draft} shape={previewShape} />
        </div>
        <div className="flex items-center justify-center gap-2 py-1.5">
          <button
            className={`rounded px-2 py-0.5 text-[10px] ${previewShape === 'sphere' ? 'bg-blue-600 text-white' : 'text-[var(--text-dim)] hover:bg-white/10'}`}
            onClick={() => setPreviewShape('sphere')}
          >
            Sphere
          </button>
          <button
            className={`rounded px-2 py-0.5 text-[10px] ${previewShape === 'cube' ? 'bg-blue-600 text-white' : 'text-[var(--text-dim)] hover:bg-white/10'}`}
            onClick={() => setPreviewShape('cube')}
          >
            Cube
          </button>
          <span className="text-[10px] text-[var(--text-faint)]">drag to rotate · double-click to auto-rotate</span>
        </div>
      </div>

      <Section title="Basic Information">
        <Field label="Material name">
          <input className={inputClass} value={draft.name} onChange={(e) => update('name', e.target.value)} />
        </Field>
        <Field label="Category">
          <input
            className={inputClass}
            value={draft.category}
            list="material-categories"
            onChange={(e) => update('category', e.target.value)}
          />
          <datalist id="material-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Manufacturer">
            <input className={inputClass} value={draft.manufacturer} onChange={(e) => update('manufacturer', e.target.value)} />
          </Field>
          <Field label="Product name">
            <input className={inputClass} value={draft.productName} onChange={(e) => update('productName', e.target.value)} />
          </Field>
        </div>
        <Field label="Material ID">
          <input className={inputClass} value={draft.materialId} onChange={(e) => update('materialId', e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea
            className={`${inputClass} h-16 resize-none`}
            value={draft.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Diffuse / Base Colour">
        <Field label="Base colour">
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-10 cursor-pointer rounded border border-[var(--panel-border)] bg-transparent"
              value={draft.baseColor}
              onChange={(e) => update('baseColor', e.target.value)}
            />
            <span className="text-[11px] text-[var(--text-dim)]">
              {draft.diffuseMap ? 'Tints the diffuse texture' : 'Used as a solid colour (no diffuse texture)'}
            </span>
          </div>
        </Field>
        <TextureSlot
          label="Diffuse / base colour PNG"
          testId="upload-diffuse"
          assetId={draft.diffuseMap?.assetId}
          fileName={draft.diffuseMap?.fileName}
          onUpload={(f) => void handleUpload('diffuseMap', f)}
          onClear={() => update('diffuseMap', null)}
        />
      </Section>

      <Section title="Bump / Normal Map">
        <Field label="Map type">
          <div className="flex gap-3">
            {(['none', 'bump', 'normal'] as BumpMapType[]).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-xs text-[var(--text)]">
                <input type="radio" checked={draft.bumpMapType === t} onChange={() => update('bumpMapType', t)} />
                {t === 'none' ? 'None' : t === 'bump' ? 'Bump / Height Map' : 'Normal Map'}
              </label>
            ))}
          </div>
        </Field>
        {draft.bumpMapType !== 'none' && (
          <>
            <TextureSlot
              label={draft.bumpMapType === 'bump' ? 'Bump / height PNG' : 'Normal PNG'}
              testId="upload-bump-normal"
              assetId={draft.bumpNormalMap?.assetId}
              fileName={draft.bumpNormalMap?.fileName}
              onUpload={(f) => void handleUpload('bumpNormalMap', f)}
              onClear={() => update('bumpNormalMap', null)}
            />
            <Field label={`${draft.bumpMapType === 'bump' ? 'Bump' : 'Normal'} strength: ${(draft.bumpMapType === 'bump' ? draft.bumpScale : draft.normalScale).toFixed(2)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={draft.bumpMapType === 'bump' ? draft.bumpScale : draft.normalScale}
                onChange={(e) =>
                  update(draft.bumpMapType === 'bump' ? 'bumpScale' : 'normalScale', Number(e.target.value))
                }
                className="w-full"
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Material Properties">
        <Field label={`Roughness: ${draft.roughness.toFixed(2)}`}>
          <input type="range" min={0} max={1} step={0.01} value={draft.roughness} onChange={(e) => update('roughness', Number(e.target.value))} className="w-full" />
        </Field>
        <Field label={`Metalness: ${draft.metalness.toFixed(2)}`}>
          <input type="range" min={0} max={1} step={0.01} value={draft.metalness} onChange={(e) => update('metalness', Number(e.target.value))} className="w-full" />
        </Field>
        <Field label={`Opacity: ${draft.opacity.toFixed(2)}`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={draft.opacity}
            onChange={(e) => update('opacity', Number(e.target.value))}
            className="w-full"
          />
        </Field>
      </Section>

      <Section title="Physical Texture Scale">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Texture width (mm)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={draft.physicalWidthMm}
              onChange={(e) => update('physicalWidthMm', Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Texture height (mm)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={draft.physicalHeightMm}
              onChange={(e) => update('physicalHeightMm', Number(e.target.value) || 1)}
            />
          </Field>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--text-faint)]">
          The real-world size the uploaded texture represents. UV repeat is calculated for you — 1 scene
          unit (1m) of surface tiles the texture {(1000 / Math.max(draft.physicalWidthMm, 1)).toFixed(2)}× ×{' '}
          {(1000 / Math.max(draft.physicalHeightMm, 1)).toFixed(2)}×.
        </p>
      </Section>

      <Section title="UV Transform" defaultOpen={false}>
        <Field label={`Rotation: ${draft.textureRotationDeg}°`}>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={draft.textureRotationDeg}
            onChange={(e) => update('textureRotationDeg', Number(e.target.value))}
            className="w-full"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Offset U">
            <input
              type="number"
              step={0.05}
              className={inputClass}
              value={draft.textureOffsetU}
              onChange={(e) => update('textureOffsetU', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Offset V">
            <input
              type="number"
              step={0.05}
              className={inputClass}
              value={draft.textureOffsetV}
              onChange={(e) => update('textureOffsetV', Number(e.target.value) || 0)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Optional Maps (Roughness / Metallic / AO / Emissive)" defaultOpen={false}>
        <TextureSlot
          label="Roughness map"
          testId="upload-roughness"
          assetId={draft.roughnessMap?.assetId}
          fileName={draft.roughnessMap?.fileName}
          onUpload={(f) => void handleUpload('roughnessMap', f)}
          onClear={() => update('roughnessMap', null)}
        />
        <TextureSlot
          label="Metalness map"
          testId="upload-metalness"
          assetId={draft.metalnessMap?.assetId}
          fileName={draft.metalnessMap?.fileName}
          onUpload={(f) => void handleUpload('metalnessMap', f)}
          onClear={() => update('metalnessMap', null)}
        />
        <TextureSlot
          label="Ambient occlusion map"
          testId="upload-ao"
          assetId={draft.aoMap?.assetId}
          fileName={draft.aoMap?.fileName}
          onUpload={(f) => void handleUpload('aoMap', f)}
          onClear={() => update('aoMap', null)}
        />
        <TextureSlot
          label="Emissive map"
          testId="upload-emissive"
          assetId={draft.emissiveMap?.assetId}
          fileName={draft.emissiveMap?.fileName}
          onUpload={(f) => void handleUpload('emissiveMap', f)}
          onClear={() => update('emissiveMap', null)}
        />
        {draft.emissiveMap && (
          <>
            <Field label="Emissive colour">
              <input
                type="color"
                className="h-8 w-10 cursor-pointer rounded border border-[var(--panel-border)] bg-transparent"
                value={draft.emissiveColor}
                onChange={(e) => update('emissiveColor', e.target.value)}
              />
            </Field>
            <Field label={`Emissive intensity: ${draft.emissiveIntensity.toFixed(2)}`}>
              <input
                type="range"
                min={0}
                max={5}
                step={0.05}
                value={draft.emissiveIntensity}
                onChange={(e) => update('emissiveIntensity', Number(e.target.value))}
                className="w-full"
              />
            </Field>
          </>
        )}
      </Section>

      <div className="sticky bottom-0 flex gap-2 border-t bg-[var(--panel-bg)] p-3" style={{ borderColor: 'var(--panel-border)' }}>
        <Button variant="ghost" onClick={closeMaterialEditor} className="flex-1 justify-center">
          CANCEL
        </Button>
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !draft.name.trim()} className="flex-1 justify-center">
          {saving ? 'SAVING…' : isNew ? 'SAVE MATERIAL' : 'SAVE CHANGES'}
        </Button>
      </div>
    </PanelShell>
  )
}
