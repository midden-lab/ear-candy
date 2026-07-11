import type { Season, Episode } from '../types'
import SeasonTabs from './SeasonTabs'
import EpisodeItem from './EpisodeItem'

export interface EpisodeListViewProps {
  podcastName: string
  seasons: Season[]
  episodes: Episode[]
  activeSeason: number | null
  loading?: boolean
  /** id of the episode currently loaded in the player, if any. */
  activeEpisodeId?: number | null
  /** Whether the active episode is currently playing (drives the EQ indicator). */
  playing?: boolean
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
  podcastName, seasons, episodes, activeSeason, loading, activeEpisodeId, playing, onSeasonSelect, onEpisodeClick,
}: EpisodeListViewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Hidden on mobile: MobileHeader already shows the podcast name there. */}
      <div className="hidden px-4 py-3 border-b border-zinc-800 md:block">
        <h2 className="text-sm font-semibold text-zinc-100 truncate">{podcastName}</h2>
      </div>
      <SeasonTabs seasons={seasons} activeSeason={activeSeason} onSelect={onSeasonSelect} />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="p-2 text-sm text-zinc-500">Loading…</p>
        ) : episodes.length === 0 ? (
          <p className="p-2 text-sm text-zinc-500">No episodes in this season yet.</p>
        ) : (
          episodes.map(ep => (
            <EpisodeItem
              key={ep.id}
              episode={ep}
              isActive={activeEpisodeId === ep.id}
              isPlaying={Boolean(playing) && activeEpisodeId === ep.id}
              onClick={onEpisodeClick}
            />
          ))
        )}
      </div>
    </div>
  )
}
