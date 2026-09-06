import type { Season, Episode } from '../types'
import SeasonTabs from './SeasonTabs'
import SeasonPicker from './SeasonPicker'
import EpisodeItem from './EpisodeItem'
import PrivacyNotice from './PrivacyNotice'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'
import { searchAllEpisodes } from '../utils/search'

export interface EpisodeListViewProps {
  seasons: Season[]
  episodes: Episode[]
  /** Every visible episode across every season — powers cross-catalog
   *  search, independent of the season-scoped `episodes` list above.
   *  Defaults to empty so callers that don't pass it (existing tests) see
   *  no behavior change, matching this file's existing convention for
   *  additive props (see `analyticsEnabled` below). */
  allEpisodes?: Episode[]
  /** Cross-catalog search query. Non-empty means the rendered list is
   *  searchAllEpisodes(allEpisodes, searchQuery) instead of `episodes`. */
  searchQuery?: string
  onSearchChange?: (query: string) => void
  activeSeason: number | null
  /** Whether first-party analytics is administratively enabled — drives the
   *  PrivacyNotice disclosure at the bottom of the list; renders nothing
   *  when false. Defaults to false so callers that don't pass it (existing
   *  tests) see no behavior change. */
  analyticsEnabled?: boolean
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
 * Pure season/episode browser: a search box, season tabs, and a scrollable
 * episode list with loading/empty states. Takes which episode is
 * active/playing as props rather than reading any app-specific store, so it
 * has no dependency on how or where playback state lives.
 */
export default function EpisodeListView({
  seasons, episodes, allEpisodes = [], searchQuery = '', onSearchChange = () => {}, activeSeason, analyticsEnabled = false, loading, activeEpisodeId, playingEpisodeId, playing, getRemainingSeconds, onSeasonSelect, onEpisodeClick,
}: EpisodeListViewProps) {
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)
  const isSearching = searchQuery.trim() !== ''
  const searchResults = isSearching ? searchAllEpisodes(allEpisodes, searchQuery) : []
  const episodeCounts = allEpisodes.reduce<Record<number, number>>((acc, ep) => {
    acc[ep.season_id] = (acc[ep.season_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search episodes or guests"
          aria-label="Search episodes"
          className="w-full min-h-11 rounded-md border border-zinc-200 bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] dark:border-zinc-800"
        />
      </div>

      {!isSearching && (
        isDesktop
          ? <SeasonTabs seasons={seasons} activeSeason={activeSeason} episodeCounts={episodeCounts} onSelect={onSeasonSelect} />
          : <div className="px-4 py-2"><SeasonPicker seasons={seasons} activeSeason={activeSeason} episodeCounts={episodeCounts} onSelect={onSeasonSelect} /></div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isSearching ? (
          searchResults.length === 0 ? (
            <p className="p-2 text-sm text-zinc-400 dark:text-zinc-500">No episodes match &ldquo;{searchQuery.trim()}&rdquo;.</p>
          ) : (
            searchResults.map(({ episode: ep, seasonId }) => {
              const season = seasons.find(s => s.id === seasonId)
              return (
                <EpisodeItem
                  key={ep.id}
                  episode={ep}
                  isActive={activeEpisodeId === ep.id}
                  isPlaying={Boolean(playing) && playingEpisodeId === ep.id}
                  remainingSeconds={getRemainingSeconds?.(ep)}
                  seasonTag={season ? `S${season.number}` : undefined}
                  onClick={onEpisodeClick}
                />
              )
            })
          )
        ) : loading ? (
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
      <PrivacyNotice analyticsEnabled={analyticsEnabled} />
    </div>
  )
}
