import { Button } from './Button'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = 'CONFIRM', danger, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] p-4 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h3>
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-dim)]">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            CANCEL
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
