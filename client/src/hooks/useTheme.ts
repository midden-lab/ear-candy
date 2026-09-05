import { useEffect, useState, useCallback } from 'react'
import { getContrastTextColor, getDarkModeAccent } from '../utils/color'

export function useTheme(accentColor: string): { isDark: boolean; toggleDark: () => void } {
  const [isDark, setIsDark] = useState(() => {
    // Dark is the app's long-standing default look. Only an explicit
    // 'light' choice (from a prior toggle) should opt someone out of it —
    // no saved preference must not silently change existing users' view.
    const saved = localStorage.getItem('theme')
    return saved !== 'light'
  })

  useEffect(() => {
    // accent_color is admin-supplied with no contrast validation. In light
    // mode it's used as-is; in dark mode it's lightened first, since a
    // saturated accent that reads fine on a light canvas can lose contrast
    // against a dark one — see getDarkModeAccent. --accent-contrast is
    // computed from whichever variant is actually in effect, not always the
    // raw admin color, so button text stays readable in both themes.
    const effectiveAccent = isDark ? getDarkModeAccent(accentColor) : accentColor
    document.documentElement.style.setProperty('--accent', effectiveAccent)
    document.documentElement.style.setProperty('--accent-contrast', getContrastTextColor(effectiveAccent))
  }, [accentColor, isDark])

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleDark = useCallback(() => setIsDark(d => !d), [])

  return { isDark, toggleDark }
}
