import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

interface AppShellProps {
  /** Full-width header rendered above everything else, on both desktop and
   *  mobile. Callers build the right variant (with or without the desktop
   *  station/Light-Dark controls) themselves — AppShell stays
   *  breakpoint-agnostic for this prop like all its others. */
  masthead: ReactNode
  sidebar: ReactNode
  detail: ReactNode
  /** Mobile Settings screen content, shown when focusedPane is 'settings'.
   *  Ignored on desktop, which shows the same Station/Light-Dark controls
   *  directly in the masthead instead of a separate settings screen. Admin
   *  is not here — it lives next to the analytics disclosure inside
   *  `sidebar` on both breakpoints. */
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

  // Desktop and mobile use genuinely different scroll models now, matching
  // the mockup's own two separate shells rather than one shared shape with
  // conditional pieces — confirmed empirically (real getComputedStyle() +
  // scroll-event checks, not just reading the CSS) that the mockup's
  // desktop has NO scroll containers at all: .stage/.index both compute
  // overflow-y:visible, and the whole document scrolls as one unit, with
  // .index{position:sticky;top:44px} doing the work of keeping the episode
  // list anchored near the top. The mockup's mobile shell, by contrast, IS
  // a bounded box with its own internal .m-scroll{overflow-y:auto} region
  // (a "phone frame" in the mockup's own preview chrome) — so mobile's
  // existing viewport-locked shell below is correct and unchanged.
  if (isDesktop) {
    return (
      <div className="flex flex-col bg-canvas">
        {/* w-full: .room's own `margin:0 auto` centering assumes a normal
            block-flow parent (the mockup's real context). As a flex item
            here, an auto cross-axis margin overrides flexbox's default
            stretch sizing, collapsing .room to its content's intrinsic
            width instead of filling the viewport up to max-width:1520px —
            confirmed directly (without w-full, .room measured ~806px wide
            in a 1400px viewport). w-full restores the fill-then-cap-then-
            center behavior .room's own CSS assumes.
            The dock-clearance padding lives here (not per-pane) since
            there's only one scrolling region now — the document itself.
            masthead lives INSIDE .room (matching the mockup's own DOM:
            <div class="room"><header class="masthead">...<div class="floor">)
            — .room supplies the 72px horizontal page margin via its own
            padding, and .masthead has no horizontal padding of its own.
            Rendering masthead as a sibling of .room instead (an earlier,
            since-fixed version of this file did exactly that) starves it
            of that margin entirely: confirmed directly, "My Podcast" sat
            flush at x=0 and .admin-link's right edge sat flush at the
            viewport's right edge with zero margin. */}
        <div
          className="room w-full"
          style={{ paddingBottom: 'calc(var(--player-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
        >
          {masthead}
          {/* .floor keeps its own declared align-items:start (content-sized
              columns) — no stretch override needed now that .stage/.index
              aren't independent scroll regions that needed a locked height
              to scroll within. */}
          <div className="floor">
            <main ref={mainRef} tabIndex={-1} className="stage">
              {detail}
            </main>
            <aside className="index">
              {sidebar}
            </aside>
          </div>
        </div>
        {player}
      </div>
    )
  }

  // Static height of the mobile bottom tab bar, fed to descendants (the
  // mini-player docks above it; <main>'s padding-bottom reserves space for
  // it) via a CSS var rather than measuring, since the bar's height never
  // changes.
  const rootStyle = {
    '--tabbar-h': 'calc(4rem + env(safe-area-inset-bottom, 0px))',
  } as CSSProperties

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas" style={rootStyle}>
      {masthead}
      {/* .m-scroll already carries the mockup's own 22px horizontal
          padding (its content, including EpisodeListView's .m-list
          negative-margin bleed, insets from that) — overflow-x-visible
          for the same reason desktop's .index needed it before this
          change (a non-visible overflow-y forces overflow-x to auto too,
          per CSS Overflow §3, which would otherwise clip the bleed).
          .m-pane wraps whichever pane is showing uniformly, rather than
          each pane component wrapping itself. */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="m-scroll flex-1 overflow-y-auto overflow-x-visible"
        style={{ paddingBottom: 'calc(var(--player-h, 0px) + var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="m-pane active">
          {focusedPane === 'list' ? sidebar : focusedPane === 'settings' ? settings : detail}
        </div>
      </main>

      {player}

      {tabBar}
    </div>
  )
}
