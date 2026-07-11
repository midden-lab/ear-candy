interface ThemeBadgeProps {
  isDark: boolean
  onToggle: () => void
}

export default function ThemeBadge({ isDark, onToggle }: ThemeBadgeProps) {
  return (
    <button
      onClick={onToggle}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-sm shadow-lg ring-1 ring-zinc-700 hover:bg-zinc-700 transition-colors"
      aria-label={isDark ? 'Toggle light mode' : 'Toggle dark mode'}
    >
      {isDark ? '🌙' : '☀️'}
    </button>
  )
}
