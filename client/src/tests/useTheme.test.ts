import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../hooks/useTheme'
import { getDarkModeAccent, getContrastTextColor } from '../utils/color'

describe('useTheme', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--accent-contrast')
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })

  // Light mode passes accentColor through unchanged — these explicitly
  // force light mode so they aren't relying on (or masked by) the app's
  // dark-as-default behavior, which lightens the accent (see the dark-mode
  // tests below).
  it('sets --accent CSS custom property on mount, in light mode', () => {
    localStorage.setItem('theme', 'light')
    renderHook(() => useTheme('#ff6600'))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff6600')
  })

  it('sets --accent-contrast based on the accent color luminance, in light mode', () => {
    localStorage.setItem('theme', 'light')
    renderHook(() => useTheme('#000000'))
    expect(document.documentElement.style.getPropertyValue('--accent-contrast')).toBe('#ffffff')
  })

  it('updates --accent-contrast to black text for a pale admin-set accent, in light mode', () => {
    localStorage.setItem('theme', 'light')
    renderHook(() => useTheme('#ffff00'))
    expect(document.documentElement.style.getPropertyValue('--accent-contrast')).toBe('#000000')
  })

  it('updates --accent when accentColor changes, in light mode', () => {
    localStorage.setItem('theme', 'light')
    const { rerender } = renderHook(({ color }) => useTheme(color), {
      initialProps: { color: '#ff6600' },
    })
    rerender({ color: '#0099ff' })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0099ff')
  })

  // Dark mode lightens the accent (getDarkModeAccent) rather than passing
  // it through raw, since a saturated accent that's readable on a light
  // canvas can lose contrast against a dark one.
  it('sets --accent to the lightened variant on mount, in dark mode', () => {
    localStorage.setItem('theme', 'dark')
    renderHook(() => useTheme('#5a3ef5'))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(getDarkModeAccent('#5a3ef5'))
  })

  it('computes --accent-contrast from the lightened variant, not the raw admin color, in dark mode', () => {
    localStorage.setItem('theme', 'dark')
    renderHook(() => useTheme('#000000'))
    const lightened = getDarkModeAccent('#000000')
    expect(document.documentElement.style.getPropertyValue('--accent-contrast')).toBe(getContrastTextColor(lightened))
  })

  it('re-lightens --accent when toggling from light to dark', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#5a3ef5')
    act(() => { result.current.toggleDark() })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(getDarkModeAccent('#5a3ef5'))
  })

  it('initializes isDark=true when localStorage has theme=dark', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    expect(result.current.isDark).toBe(true)
  })

  it('initializes isDark=true when localStorage is empty (dark is the default)', () => {
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    expect(result.current.isDark).toBe(true)
  })

  it('initializes isDark=false when localStorage has theme=light', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    expect(result.current.isDark).toBe(false)
  })

  it('applies dark class to <html> when isDark is true', () => {
    localStorage.setItem('theme', 'dark')
    renderHook(() => useTheme('#5a3ef5'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggleDark flips isDark and updates DOM class', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    act(() => { result.current.toggleDark() })
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => { result.current.toggleDark() })
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists dark preference to localStorage on toggle', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    act(() => { result.current.toggleDark() })
    expect(localStorage.getItem('theme')).toBe('dark')
    act(() => { result.current.toggleDark() })
    expect(localStorage.getItem('theme')).toBe('light')
  })
})
