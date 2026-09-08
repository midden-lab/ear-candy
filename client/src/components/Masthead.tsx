import ThemeSwitch from './ThemeSwitch'

// Hardcoded per plans/007's Decisions section — Ear Candy has no "station"
// field in Settings today; adding one is an explicit, deferred follow-up
// decision, not part of this component's scope. Removing this line
// entirely is also a valid future outcome of that decision.
const STATION = 'KDUR 91.9 / 93.9 FM'

interface MastheadProps {
  podcastName: string
  tagline: string
  /** Renders the right-hand station/Light-Dark toggle/Admin controls. False
   *  on mobile, where those controls live in the Settings tab instead
   *  (MobileSettingsView already does this correctly). */
  showControls?: boolean
  isDark?: boolean
  onToggleTheme?: () => void
  onAdminClick?: () => void
}

/**
 * Full-width header spanning the whole shell: wordmark + tagline on the
 * left, and (desktop only) a station callout, a Light/Dark text toggle,
 * and a plain-text Admin control on the right. Replaces IconRail's gear
 * icon and AppShell's floating ThemeBadge on desktop — no icons, per the
 * design system's icon-free-outside-transport principle.
 */
export default function Masthead({
  podcastName,
  tagline,
  showControls = false,
  isDark = false,
  onToggleTheme,
  onAdminClick,
}: MastheadProps) {
  // showControls doubles as "is this the desktop shell" — App.tsx already
  // passes isDesktopShell through unchanged — so it also picks which of the
  // mockup's two literal header structures (.masthead vs .m-header) to
  // render, rather than one shared markup tree with responsive classes.
  if (!showControls) {
    return (
      <header className="m-header">
        <h1 className="m-wordmark truncate">{podcastName}</h1>
        {tagline && <p className="m-tagline truncate">{tagline}</p>}
      </header>
    )
  }

  return (
    <header className="masthead">
      <div className="min-w-0">
        <h1 className="wordmark truncate">{podcastName}</h1>
        {tagline && <p className="tagline truncate">{tagline}</p>}
      </div>

      <div className="mast-right">
        <span className="station">{STATION}</span>
        <ThemeSwitch isDark={isDark} onToggle={onToggleTheme} />
        <button type="button" onClick={onAdminClick} className="admin-link">Admin</button>
      </div>
    </header>
  )
}
