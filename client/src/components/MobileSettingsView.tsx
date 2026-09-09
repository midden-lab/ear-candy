import ThemeSwitch from './ThemeSwitch'

// Hardcoded per plans/007's Decisions section — see Masthead.tsx's matching
// constant and comment for why this isn't sourced from Settings (yet).
const STATION = 'KDUR 91.9 / 93.9 FM'

interface MobileSettingsViewProps {
  isDark: boolean
  onToggleTheme: () => void
}

/**
 * Mobile Settings screen, reached via MobileTabBar's Settings tab —
 * replaces the old hidden "⋮" kebab menu's theme item with an
 * always-reachable, labeled screen. Reuses the exact same .themeswitch/
 * .station markup as the desktop masthead — the mockup's own mobile
 * settings pane does the same (plans/010), rather than the earlier circular
 * ThemeBadge icon this replaced. Admin used to live here too; it now lives
 * next to the "Anonymous listening analytics" disclosure in the episode
 * list (Episodes tab) on both breakpoints, so it's reachable even when this
 * screen is showing something else.
 */
export default function MobileSettingsView({ isDark, onToggleTheme }: MobileSettingsViewProps) {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold tracking-tight text-ink">Settings</h1>
      <div className="m-settings-row flex items-center justify-between">
        <p className="m-settings-label">Appearance</p>
        <ThemeSwitch isDark={isDark} onToggle={onToggleTheme} />
      </div>
      <div className="m-settings-row flex items-center justify-between">
        <p className="m-settings-label">Station</p>
        <span className="station">{STATION}</span>
      </div>
    </div>
  )
}
