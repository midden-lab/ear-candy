import type { Season, Episode } from '../types'
import { usePlayerStore } from '../store/playerStore'
import EpisodeListView from './EpisodeListView'

interface EpisodeListProps {
  podcastName: string
  seasons: Season[]
  episodes: Episode[]
  activeSeason: number | null
  loading?: boolean
  onSeasonSelect: (seasonId: number) => void
  /** App-specific: e.g. focuses the mobile detail pane. Not store-related. */
  onEpisodeSelect?: () => void
}

/**
 * Connects EpisodeListView to this app's global player store. Kept
 * deliberately thin — all real list-browsing behavior lives in
 * EpisodeListView, which takes no dependency on this app's state management.
 */
export default function EpisodeList({
  podcastName, seasons, episodes, activeSeason, loading, onSeasonSelect, onEpisodeSelect,
}: EpisodeListProps) {
  const currentEpisode = usePlayerStore(state => state.episode)
  const playing = usePlayerStore(state => state.playing)
  const setEpisode = usePlayerStore(state => state.setEpisode)
  const setPlaying = usePlayerStore(state => state.setPlaying)

  function handleEpisodeClick(ep: Episode) {
    setEpisode(ep)
    setPlaying(true)
    onEpisodeSelect?.()
  }

  return (
    <EpisodeListView
      podcastName={podcastName}
      seasons={seasons}
      episodes={episodes}
      activeSeason={activeSeason}
      loading={loading}
      activeEpisodeId={currentEpisode?.id ?? null}
      playing={playing}
      onSeasonSelect={onSeasonSelect}
      onEpisodeClick={handleEpisodeClick}
    />
  )
}
