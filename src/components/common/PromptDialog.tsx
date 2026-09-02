import { useState } from 'react'
import { Button } from './Button'

interface Props {
  title: string
  label?: string
  initialValue?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (value: string) => void
}

export function PromptDialog({ title, label, initialValue = '', confirmLabel = 'CONFIRM', onCancel, onConfirm }: Props) {
  const [value, setValue] = useState(initialValue)
  const trimmed = value.trim()

  function submit() {
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] p-4 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h3>
        {label && <p className="mb-1.5 text-xs leading-relaxed text-[var(--text-dim)]">{label}</p>}
        <input
          autoFocus
          className="mb-4 w-full rounded border border-[var(--panel-border)] bg-[#2a2c33] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-blue-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            CANCEL
          </Button>
          <Button variant="primary" onClick={submit} disabled={!trimmed}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
