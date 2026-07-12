import { useEffect, useState, useCallback } from 'react'
import { getContrastTextColor } from '../utils/color'

export function useTheme(accentColor: string): { isDark: boolean; toggleDark: () => void } {
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor)
    // accent_color is admin-supplied with no contrast validation — compute
    // readable text color for it rather than hardcoding text-white, since a
    // pale admin-chosen accent would otherwise produce unreadable buttons.
    document.documentElement.style.setProperty('--accent-contrast', getContrastTextColor(accentColor))
  }, [accentColor])

  const [isDark, setIsDark] = useState(() => {
    // Dark is the app's long-standing default look. Only an explicit
    // 'light' choice (from a prior toggle) should opt someone out of it —
    // no saved preference must not silently change existing users' view.
    const saved = localStorage.getItem('theme')
    return saved !== 'light'
  })

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
