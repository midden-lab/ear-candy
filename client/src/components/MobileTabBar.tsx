export type MobileTab = 'playing' | 'episodes' | 'settings'

interface MobileTabBarProps {
  /** Which tab is highlighted as current. `null` means none — e.g. the
   *  detail pane is open on an episode that isn't the one actually
   *  playing (reached by browsing, not via the Playing tab or mini-bar),
   *  matching the app's existing "no tab highlighted while drilled into a
   *  detail view" behavior. */
  activeTab: MobileTab | null
  onSelectPlaying: () => void
  onSelectEpisodes: () => void
  onSelectSettings: () => void
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  // The active-state text color and underline (::after) are both driven
  // entirely by CSS off aria-current (.m-tabbar button[aria-current="true"]
  // / ...::after) — no separate indicator element or conditional class
  // needed, matching the mockup's own markup exactly.
  return (
    <button onClick={onClick} aria-current={active ? 'true' : undefined}>
      {label}
    </button>
  )
}

/**
 * Persistent mobile bottom tab bar (Playing / Episodes / Settings). No
 * icons — per the design system's "no icons outside playback transport"
 * principle, applied uniformly across all three tabs rather than only to
 * the ones that happen to need it (a partial adoption would read as
 * visually incoherent). The active tab is shown via accent-colored text
 * plus a thin accent-colored indicator bar, reusing the app's one repeated
 * "position/selection" motif (the same visual language as the scrub bar
 * and mini-player progress fill) rather than an icon+pill treatment.
 *
 * "Playing" is always tappable, never disabled — tapping it with nothing
 * loaded still navigates to the detail view, which already has its own
 * "Select an episode to begin" placeholder for a null episode.
 */
export default function MobileTabBar({ activeTab, onSelectPlaying, onSelectEpisodes, onSelectSettings }: MobileTabBarProps) {
  return (
    // .m-tabbar has no background of its own in the mockup — there, it's a
    // plain flex child stacked at the bottom of a bounded phone-frame box,
    // so the frame's own canvas background shows through. Here it's a
    // position:fixed overlay atop real scrolling content instead (this app
    // has no bounded frame to stack within), so bg-surface/95 + backdrop-
    // blur stays a necessary, disclosed deviation — without it, scrolled
    // rows would show through the transparent bar.
    <nav className="m-tabbar fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur">
      <TabButton label="Playing" active={activeTab === 'playing'} onClick={onSelectPlaying} />
      <TabButton label="Episodes" active={activeTab === 'episodes'} onClick={onSelectEpisodes} />
      <TabButton label="Settings" active={activeTab === 'settings'} onClick={onSelectSettings} />
    </nav>
  )
}
