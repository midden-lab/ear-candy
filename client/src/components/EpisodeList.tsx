import type { Season, Episode } from '../types'
import { usePlayerStore } from '../store/playerStore'
import { getEpisodeProgress } from '../utils/episodeProgress'
import EpisodeListView from './EpisodeListView'

interface EpisodeListProps {
  podcastName: string
  seasons: Season[]
  episodes: Episode[]
  activeSeason: number | null
  /** Whether first-party analytics is administratively enabled — threaded
   *  through to PrivacyNotice via EpisodeListView. */
  analyticsEnabled?: boolean
  loading?: boolean
  /** id of the episode currently shown in the detail pane — independent of
   *  what's actually loaded in the player, since browsing must never
   *  interrupt background playback. */
  viewingEpisodeId: number | null
  onSeasonSelect: (seasonId: number) => void
  /** App-specific: e.g. focuses the mobile detail pane. Not store-related. */
  onEpisodeSelect?: () => void
  /** Fired when an episode row is clicked — just navigates to that
   *  episode's detail view, does not touch the player. */
  onEpisodeView: (episode: Episode) => void
}

/**
 * Connects EpisodeListView to this app's global player store. Kept
 * deliberately thin — all real list-browsing behavior lives in
 * EpisodeListView, which takes no dependency on this app's state management.
 */
export default function EpisodeList({
  podcastName, seasons, episodes, activeSeason, analyticsEnabled, loading, viewingEpisodeId, onSeasonSelect, onEpisodeSelect, onEpisodeView,
}: EpisodeListProps) {
  const playingEpisode = usePlayerStore(state => state.episode)
  const playing = usePlayerStore(state => state.playing)
  const currentTime = usePlayerStore(state => state.currentTime)

  function handleEpisodeClick(ep: Episode) {
    onEpisodeView(ep)
    // Keep the URL deep-linkable to whatever's currently being viewed, so
    // reloading or copying the address bar URL lands back on this episode.
    // A plain click always starts fresh, so any shared-link `t` param is
    // dropped rather than carried over to an unrelated selection.
    // Deliberately replaceState, never pushState — this app has no
    // popstate listener, and since nothing ever pushes a new history
    // entry, there's no stale per-episode entry for back/forward to land
    // on (verified empirically: window.history.length doesn't grow across
    // episode switches). See CLAUDE.md's Client gotchas (issue #55).
    const url = new URL(window.location.href)
    url.searchParams.set('episode', String(ep.id))
    url.searchParams.delete('t')
    window.history.replaceState(null, '', url)
    onEpisodeSelect?.()
  }

  // The episode actually loaded in the player always knows its live
  // position; every other episode falls back to its last saved progress
  // (or none, if never partially listened to). This is what makes the
  // "remaining time" naturally decrement while playing — currentTime only
  // changes during real playback — and stay static everywhere else.
  function getRemainingSeconds(ep: Episode): number | undefined {
    if (ep.duration_seconds <= 0) return undefined
    const progress = playingEpisode?.id === ep.id ? currentTime : getEpisodeProgress(ep.id)
    if (progress === undefined) return undefined
    const remaining = ep.duration_seconds - progress
    return remaining > 0 ? remaining : undefined
  }

  return (
    <EpisodeListView
      podcastName={podcastName}
      seasons={seasons}
      episodes={episodes}
      activeSeason={activeSeason}
      analyticsEnabled={analyticsEnabled}
      loading={loading}
      activeEpisodeId={viewingEpisodeId}
      playingEpisodeId={playingEpisode?.id ?? null}
      playing={playing}
      getRemainingSeconds={getRemainingSeconds}
      onSeasonSelect={onSeasonSelect}
      onEpisodeClick={handleEpisodeClick}
    />
  )
}
