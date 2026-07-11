import { renderHook, act } from '@testing-library/react'
import { useBreakpoint } from '../hooks/useBreakpoint'

function mockMatchMedia(initialMatches: boolean) {
  let changeHandler: ((e: MediaQueryListEvent) => void) | null = null
  const mql = {
    matches: initialMatches,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') changeHandler = handler
    },
    removeEventListener: (event: string) => {
      if (event === 'change') changeHandler = null
    },
    dispatchEvent: () => false,
  }
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia
  return {
    fireChange: (matches: boolean) => {
      mql.matches = matches
      act(() => { changeHandler?.({ matches } as MediaQueryListEvent) })
    },
  }
}

it('returns the initial matchMedia value', () => {
  mockMatchMedia(true)
  const { result } = renderHook(() => useBreakpoint('(min-width: 768px)'))
  expect(result.current).toBe(true)
})

it('reacts to a matchMedia change event, not just the initial value', () => {
  const { fireChange } = mockMatchMedia(false)
  const { result } = renderHook(() => useBreakpoint('(min-width: 768px)'))
  expect(result.current).toBe(false)

  fireChange(true)
  expect(result.current).toBe(true)

  fireChange(false)
  expect(result.current).toBe(false)
})
