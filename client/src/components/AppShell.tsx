import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

interface AppShellProps {
  /** Full-width header rendered above everything else, on both desktop and
   *  mobile. Callers build the right variant (with or without the desktop
   *  Light/Dark + Admin controls) themselves — AppShell stays
   *  breakpoint-agnostic for this prop like all its others. */
  masthead: ReactNode
  sidebar: ReactNode
  detail: ReactNode
  /** Mobile Settings screen content, shown when focusedPane is 'settings'.
   *  Ignored on desktop (reached via the masthead's Admin control there
   *  instead). */
  settings?: ReactNode
  player?: ReactNode
  /** MobileTabBar (or equivalent), fixed at the very bottom on mobile.
   *  Ignored on desktop. */
  tabBar?: ReactNode
  /** Which pane is focused on mobile; has no visual effect at `md` and up. */
  focusedPane?: 'list' | 'detail' | 'settings'
}

export default function AppShell({
  masthead,
  sidebar,
  detail,
  settings,
  player,
  tabBar,
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

  const paneStyle = { paddingBottom: 'calc(var(--player-h, 0px) + var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px))' }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas" style={rootStyle}>
      {isDesktop ? (
        // .room/.floor per the mockup: 72px horizontal page margin + 1520px
        // max-width centering, a 372px-wide index column with a 104px gap
        // (collapsing to one column under 1180px, handled entirely by
        // .floor's own media query). pb-0 zeroes .room's own 200px bottom
        // padding — that value exists in the mockup to clear its fixed
        // dock on a page that scrolls as a whole; this app scrolls each
        // pane independently instead, and already reserves dock space via
        // paneStyle below, so a second, static reservation at the room
        // level would just waste layout height. items-stretch overrides
        // .floor's own `align-items:start` (content-sized columns) so
        // .stage/.index actually stretch to fill the available height —
        // required for their independent overflow-y-auto scrolling.
        // w-full: .room's own `margin:0 auto` centering assumes a normal
        // block-flow parent (the mockup's real context). As a flex item
        // here, an auto cross-axis margin overrides flexbox's default
        // stretch sizing, collapsing .room to its content's intrinsic
        // width instead of filling the viewport up to max-width:1520px —
        // confirmed directly (without w-full, .room measured ~806px wide
        // in a 1400px viewport). w-full restores the fill-then-cap-then-
        // center behavior .room's own CSS assumes.
        <div className="room w-full pb-0 flex flex-1 flex-col overflow-hidden">
          {masthead}
          <div className="floor flex-1 items-stretch overflow-hidden">
            <main ref={mainRef} tabIndex={-1} className="stage overflow-y-auto" style={paneStyle}>
              {detail}
            </main>
            <aside className="index overflow-y-auto overflow-x-visible" style={paneStyle}>
              {sidebar}
            </aside>
          </div>
        </div>
      ) : (
        // .m-scroll already carries the mockup's own 22px horizontal
        // padding (its content, including EpisodeListView's .m-list
        // negative-margin bleed, insets from that) — overflow-x-visible
        // for the same reason as desktop's .index above. .m-pane wraps
        // whichever pane is showing uniformly, rather than each pane
        // component wrapping itself.
        <>
          {masthead}
          <main ref={mainRef} tabIndex={-1} className="m-scroll flex-1 overflow-y-auto overflow-x-visible" style={paneStyle}>
            <div className="m-pane active">
              {focusedPane === 'list' ? sidebar : focusedPane === 'settings' ? settings : detail}
            </div>
          </main>
        </>
      )}

      {player}

      {!isDesktop && tabBar}
    </div>
  )
}
