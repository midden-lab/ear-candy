import { useSyncExternalStore } from 'react'

/** Matches Tailwind's default `md` breakpoint. */
export const MD_BREAKPOINT_QUERY = '(min-width: 768px)'

/**
 * Live viewport breakpoint check backed by matchMedia, not a one-time
 * window.innerWidth read — reacts to resize so a desktop window resized
 * down to phone width behaves identically to an actual phone.
 */
export function useBreakpoint(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches
  )
}
