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
  return (
    <button
      onClick={onClick}
      className="relative flex flex-1 flex-col items-center gap-0.5 py-2"
      aria-current={active ? 'true' : undefined}
    >
      <span className={`text-xs font-medium ${active ? 'text-[var(--accent)]' : 'text-zinc-500 dark:text-zinc-400'}`}>
        {label}
      </span>
      <span
        aria-hidden="true"
        className={`absolute bottom-0 h-0.5 w-6 rounded-full bg-[var(--accent)] transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
      />
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
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-2 py-1">
        <TabButton label="Playing" active={activeTab === 'playing'} onClick={onSelectPlaying} />
        <TabButton label="Episodes" active={activeTab === 'episodes'} onClick={onSelectEpisodes} />
        <TabButton label="Settings" active={activeTab === 'settings'} onClick={onSelectSettings} />
      </div>
    </nav>
  )
}
