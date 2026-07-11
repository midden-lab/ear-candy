import { useEffect, useRef, type ReactNode } from 'react'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

interface AppShellProps {
  rail: ReactNode
  mobileHeader?: ReactNode
  sidebar: ReactNode
  detail: ReactNode
  player?: ReactNode
  themeBadge?: ReactNode
  /** Which pane is focused on mobile; has no visual effect at `md` and up. */
  focusedPane?: 'list' | 'detail'
}

export default function AppShell({
  rail,
  mobileHeader,
  sidebar,
  detail,
  player,
  themeBadge,
  focusedPane = 'list',
}: AppShellProps) {
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)
  const mainRef = useRef<HTMLElement>(null)

  // Move focus to the main content region on mobile pane transitions, so
  // screen-reader/keyboard users get parity with the visual list<->detail
  // navigation. No-op on desktop, where both panes are always visible.
  useEffect(() => {
    if (!isDesktop) mainRef.current?.focus()
  }, [focusedPane, isDesktop])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950 md:flex-row">
      {isDesktop ? (
        <aside
          className="flex flex-shrink-0"
          style={{ paddingBottom: 'calc(var(--player-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
        >
          {rail}
          <div className="w-64 overflow-y-auto border-r border-zinc-800">
            {sidebar}
          </div>
        </aside>
      ) : (
        focusedPane === 'list' && mobileHeader
      )}

      <main
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(var(--player-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
      >
        {isDesktop ? detail : (focusedPane === 'list' ? sidebar : detail)}
      </main>

      {player}

      {themeBadge && isDesktop && (
        <div className="fixed bottom-4 right-4 z-50">
          {themeBadge}
        </div>
      )}
    </div>
  )
}
