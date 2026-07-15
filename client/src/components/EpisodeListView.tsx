import type { Season, Episode } from '../types'
import SeasonTabs from './SeasonTabs'
import EpisodeItem from './EpisodeItem'

export interface EpisodeListViewProps {
  podcastName: string
  seasons: Season[]
  episodes: Episode[]
  activeSeason: number | null
  loading?: boolean
  /** id of the episode currently shown in the detail pane (drives row
   *  highlight/aria-current) — independent of which episode is actually
   *  playing. */
  activeEpisodeId?: number | null
  /** id of the episode currently loaded in the player, if any (drives the
   *  EQ indicator) — independent of which row is highlighted. */
  playingEpisodeId?: number | null
  /** Whether the playing episode is currently playing (vs. loaded/paused). */
  playing?: boolean
  /** Seconds left in an episode the listener has partially heard, live for
   *  whichever one is actually playing. Omit/undefined renders the plain
   *  total duration instead. */
  getRemainingSeconds?: (episode: Episode) => number | undefined
  onSeasonSelect: (seasonId: number) => void
  onEpisodeClick: (episode: Episode) => void
}

/**
 * Pure season/episode browser: season tabs + a scrollable episode list with
 * loading/empty states. Takes which episode is active/playing as props
 * rather than reading any app-specific store, so it has no dependency on
 * how or where playback state lives.
 */
export default function EpisodeListView({
  podcastName, seasons, episodes, activeSeason, loading, activeEpisodeId, playingEpisodeId, playing, getRemainingSeconds, onSeasonSelect, onEpisodeClick,
}: EpisodeListViewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Hidden on mobile: MobileHeader already shows the podcast name there. */}
      <div className="hidden px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 md:block">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{podcastName}</h2>
      </div>
      <SeasonTabs seasons={seasons} activeSeason={activeSeason} onSelect={onSeasonSelect} />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="p-2 text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>
        ) : episodes.length === 0 ? (
          <p className="p-2 text-sm text-zinc-400 dark:text-zinc-500">No episodes in this season yet.</p>
        ) : (
          episodes.map(ep => (
            <EpisodeItem
              key={ep.id}
              episode={ep}
              isActive={activeEpisodeId === ep.id}
              isPlaying={Boolean(playing) && playingEpisodeId === ep.id}
              remainingSeconds={getRemainingSeconds?.(ep)}
              onClick={onEpisodeClick}
            />
          ))
        )}
      </div>
    </div>
  )
}
