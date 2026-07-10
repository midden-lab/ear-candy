import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../hooks/useTheme'

describe('useTheme', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })

  it('sets --accent CSS custom property on mount', () => {
    renderHook(() => useTheme('#ff6600'))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff6600')
  })

  it('updates --accent when accentColor changes', () => {
    const { rerender } = renderHook(({ color }) => useTheme(color), {
      initialProps: { color: '#ff6600' },
    })
    rerender({ color: '#0099ff' })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0099ff')
  })

  it('initializes isDark=true when localStorage has theme=dark', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    expect(result.current.isDark).toBe(true)
  })

  it('initializes isDark=false when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    expect(result.current.isDark).toBe(false)
  })

  it('applies dark class to <html> when isDark is true', () => {
    localStorage.setItem('theme', 'dark')
    renderHook(() => useTheme('#5a3ef5'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggleDark flips isDark and updates DOM class', () => {
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    act(() => { result.current.toggleDark() })
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => { result.current.toggleDark() })
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists dark preference to localStorage on toggle', () => {
    const { result } = renderHook(() => useTheme('#5a3ef5'))
    act(() => { result.current.toggleDark() })
    expect(localStorage.getItem('theme')).toBe('dark')
    act(() => { result.current.toggleDark() })
    expect(localStorage.getItem('theme')).toBe('light')
  })
})
