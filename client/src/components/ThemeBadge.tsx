interface ThemeBadgeProps {
  isDark: boolean
  onToggle: () => void
}

export default function ThemeBadge({ isDark, onToggle }: ThemeBadgeProps) {
  return (
    <button
      onClick={onToggle}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm shadow-lg ring-1 ring-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:bg-zinc-700 transition-colors"
      aria-label={isDark ? 'Toggle light mode' : 'Toggle dark mode'}
    >
      {isDark ? '🌙' : '☀️'}
    </button>
  )
}
