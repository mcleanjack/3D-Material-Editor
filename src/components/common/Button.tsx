import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white border-transparent',
  secondary: 'bg-[#2a2c33] hover:bg-[#33353d] text-[var(--text)] border-[var(--panel-border)]',
  ghost: 'bg-transparent hover:bg-[#2a2c33] text-[var(--text)] border-transparent',
  danger: 'bg-red-600/90 hover:bg-red-500 text-white border-transparent',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
}

export function Button({ variant = 'secondary', icon, className = '', children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
