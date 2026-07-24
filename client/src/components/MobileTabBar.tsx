import type { ReactNode } from 'react'

export type MobileTab = 'episodes' | 'settings'

interface MobileTabBarProps {
  activeTab: MobileTab
  /** Whether an episode is currently loaded in the player — the "Now
   *  Playing" tab is disabled (nothing to expand) when this is false. */
  hasPlayerEpisode: boolean
  onSelectEpisodes: () => void
  onSelectSettings: () => void
  /** "Now Playing" never changes activeTab — it only commands the player to
   *  expand to its full-screen overlay, same as tapping the mini-bar. */
  onExpandPlayer: () => void
}

function TabIcon({ children, active }: { children: ReactNode; active: boolean }) {
  return (
    <span
      className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
        active ? 'bg-[color:var(--accent)]/15 text-[var(--accent)]' : 'text-zinc-500 dark:text-zinc-400'
      }`}
    >
      {children}
    </span>
  )
}

/**
 * Persistent mobile bottom tab bar (Episodes / Now Playing / Settings),
 * replacing the old hidden "⋮" kebab menu. Fixed at the very bottom of the
 * screen; the mini-player docks above it via the --tabbar-h CSS var.
 */
export default function MobileTabBar({ activeTab, hasPlayerEpisode, onSelectEpisodes, onSelectSettings, onExpandPlayer }: MobileTabBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-2 py-1">
        <button
          onClick={onSelectEpisodes}
          className="flex flex-1 flex-col items-center gap-0.5 py-1"
          aria-current={activeTab === 'episodes' ? 'true' : undefined}
        >
          <TabIcon active={activeTab === 'episodes'}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </TabIcon>
          <span className={`text-[10px] font-medium ${activeTab === 'episodes' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
            Episodes
          </span>
        </button>

        {/* Labeled "Listening" rather than "Now Playing"/"Player" so its
            accessible name never collides with the mini-bar's own
            "Now playing: {title}..." aria-label or any "Play"/"Pause"
            transport button substring-matched by name — all can be visible
            at once. */}
        <button
          onClick={onExpandPlayer}
          disabled={!hasPlayerEpisode}
          className="flex flex-1 flex-col items-center gap-0.5 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Listening"
        >
          <TabIcon active={false}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
            </svg>
          </TabIcon>
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400" aria-hidden="true">Playing</span>
        </button>

        <button
          onClick={onSelectSettings}
          className="flex flex-1 flex-col items-center gap-0.5 py-1"
          aria-current={activeTab === 'settings' ? 'true' : undefined}
        >
          <TabIcon active={activeTab === 'settings'}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </TabIcon>
          <span className={`text-[10px] font-medium ${activeTab === 'settings' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
            Settings
          </span>
        </button>
      </div>
    </nav>
  )
}
