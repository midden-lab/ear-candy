import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

interface AppShellProps {
  rail: ReactNode
  sidebar: ReactNode
  detail: ReactNode
  /** Mobile Settings screen content, shown when focusedPane is 'settings'.
   *  Ignored on desktop (reached via the rail's admin icon there instead). */
  settings?: ReactNode
  player?: ReactNode
  /** MobileTabBar (or equivalent), fixed at the very bottom on mobile.
   *  Ignored on desktop. */
  tabBar?: ReactNode
  themeBadge?: ReactNode
  /** Which pane is focused on mobile; has no visual effect at `md` and up. */
  focusedPane?: 'list' | 'detail' | 'settings'
}

export default function AppShell({
  rail,
  sidebar,
  detail,
  settings,
  player,
  tabBar,
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

  // Static height of the mobile bottom tab bar, fed to descendants (the
  // mini-player docks above it; <main>'s padding-bottom reserves space for
  // it) via a CSS var rather than measuring, since the bar's height never
  // changes. Zero on desktop, where no tab bar renders.
  const rootStyle = {
    '--tabbar-h': isDesktop ? '0px' : 'calc(4rem + env(safe-area-inset-bottom, 0px))',
  } as CSSProperties

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 md:flex-row" style={rootStyle}>
      {isDesktop && (
        <aside
          className="flex flex-shrink-0"
          style={{ paddingBottom: 'calc(var(--player-h, 0px) + var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
        >
          {rail}
          <div className="w-64 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
            {sidebar}
          </div>
        </aside>
      )}

      <main
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(var(--player-h, 0px) + var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
      >
        {isDesktop
          ? detail
          : focusedPane === 'list'
            ? sidebar
            : focusedPane === 'settings'
              ? settings
              : detail}
      </main>

      {player}

      {!isDesktop && tabBar}

      {themeBadge && isDesktop && (
        <div className="fixed bottom-4 right-4 z-50">
          {themeBadge}
        </div>
      )}
    </div>
  )
}
