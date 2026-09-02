import type { ReactNode } from 'react'
import { Icon } from '../common/Icon'

export function PanelShell({
  title,
  onClose,
  children,
  headerExtra,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  headerExtra?: ReactNode
}) {
  return (
    <div className="flex h-full w-80 flex-col border-l" style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}>
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: 'var(--panel-border)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text)]">{title}</h2>
        <div className="flex items-center gap-1">
          {headerExtra}
          <button className="rounded p-1 text-[var(--text-dim)] hover:bg-white/10" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
