interface ThemeSwitchProps {
  isDark: boolean
  onToggle?: () => void
}

/**
 * Light/Dark text toggle, matching the mockup's `.themeswitch` exactly —
 * shared between the desktop masthead and the mobile Settings pane, which
 * both use the identical markup in the mockup (not a circular icon badge).
 * Active/inactive coloring is driven entirely by CSS off aria-pressed
 * (`.themeswitch button[aria-pressed="true"]`), no conditional class needed.
 */
export default function ThemeSwitch({ isDark, onToggle }: ThemeSwitchProps) {
  return (
    <div className="themeswitch" role="group" aria-label="Color theme">
      <button type="button" aria-pressed={!isDark} onClick={onToggle}>Light</button>
      <span className="sep" aria-hidden="true">/</span>
      <button type="button" aria-pressed={isDark} onClick={onToggle}>Dark</button>
    </div>
  )
}
