import ThemeSwitch from './ThemeSwitch'

// Hardcoded per plans/007's Decisions section — see Masthead.tsx's matching
// constant and comment for why this isn't sourced from Settings (yet).
const STATION = 'KDUR 91.9 / 93.9 FM'

interface MobileSettingsViewProps {
  onAdminClick: () => void
  isDark: boolean
  onToggleTheme: () => void
}

/**
 * Mobile Settings screen, reached via MobileTabBar's Settings tab —
 * replaces the old hidden "⋮" kebab menu's Admin + theme items with an
 * always-reachable, labeled screen. Reuses the exact same .themeswitch/
 * .station/.admin-link markup as the desktop masthead — the mockup's own
 * mobile settings pane does the same (plans/010), rather than the earlier
 * circular ThemeBadge icon this replaced.
 */
export default function MobileSettingsView({ onAdminClick, isDark, onToggleTheme }: MobileSettingsViewProps) {
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
      <div className="m-settings-row">
        <button onClick={onAdminClick} className="admin-link flex min-h-11 w-full items-center">
          Admin
        </button>
      </div>
    </div>
  )
}
