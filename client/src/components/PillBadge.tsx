interface PillBadgeProps {
  label: string
  className?: string
}

export default function PillBadge({ label, className }: PillBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ''}`}>
      {label}
    </span>
  )
}
