import { useMaterialLibraryStore } from '../../store/useMaterialLibraryStore'

interface Props {
  value: string | null
  onChange: (materialId: string | null) => void
  className?: string
}

/** A <select> of the user's custom material library, plus a "None (original FBX material)"
 * option. Used everywhere a material needs to be assigned to one or more objects. */
export function MaterialPicker({ value, onChange, className = '' }: Props) {
  const materials = useMaterialLibraryStore((s) => s.materials)

  return (
    <select
      className={`rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1 text-xs text-[var(--text)] ${className}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">None (original FBX material)</option>
      {materials.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}
