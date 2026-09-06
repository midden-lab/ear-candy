interface MastheadProps {
  podcastName: string
  tagline: string
  /** Renders the right-hand Light/Dark toggle + Admin link. False on mobile,
   *  where those controls live in the Settings tab instead
   *  (MobileSettingsView already does this correctly). */
  showControls?: boolean
  isDark?: boolean
  onToggleTheme?: () => void
  onAdminClick?: () => void
}

/**
 * Full-width header spanning the whole shell: wordmark + tagline on the
 * left, and (desktop only) a Light/Dark text toggle plus a plain-text Admin
 * control on the right. Replaces IconRail's gear icon and AppShell's
 * floating ThemeBadge on desktop — no icons, per the design system's
 * icon-free-outside-transport principle.
 */
export default function Masthead({
  podcastName,
  tagline,
  showControls = false,
  isDark = false,
  onToggleTheme,
  onAdminClick,
}: MastheadProps) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-ink">{podcastName}</h1>
        {tagline && <p className="truncate text-xs text-ink-3">{tagline}</p>}
      </div>

      {showControls && (
        <div className="flex flex-shrink-0 items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <button
              type="button"
              aria-pressed={!isDark}
              onClick={onToggleTheme}
              className={!isDark ? 'text-ink' : 'text-ink-4 hover:text-ink-2'}
            >
              Light
            </button>
            <span className="text-ink-4" aria-hidden="true">/</span>
            <button
              type="button"
              aria-pressed={isDark}
              onClick={onToggleTheme}
              className={isDark ? 'text-ink' : 'text-ink-4 hover:text-ink-2'}
            >
              Dark
            </button>
          </div>
          <button
            type="button"
            onClick={onAdminClick}
            className="text-xs font-medium text-ink-3 hover:text-ink"
          >
            Admin
          </button>
        </div>
      )}
    </header>
  )
}
