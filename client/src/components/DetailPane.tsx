import type { Episode, Season } from '../types'
import PillBadge from './PillBadge'
import EpisodeCoverArt from './EpisodeCoverArt'
import PlaybackStatusLine from './PlaybackStatusLine'
import ShareDialog from './ShareDialog'
import ProgressBar from './ProgressBar'
import TransportControls from './TransportControls'
import { getPlaybackStatus } from '../utils/playbackStatus'
import { formatTime, clampSeekTime, nextSpeed } from '../utils/playback'

interface DetailPaneProps {
  episode: Episode | null
  seasons: Season[]
  /** Whether `episode` is the one actually loaded in the player right now —
   *  distinct from merely being viewed. Determines whether the Play button
   *  toggles play/pause vs. loads this episode fresh (interrupting
   *  whatever's currently playing). */
  isCurrentPlayerEpisode?: boolean
  /** Whether the player is currently playing (only meaningful when
   *  `isCurrentPlayerEpisode` is true — otherwise the button always shows
   *  "Play", since pressing it would start this episode from scratch). */
  playing?: boolean
  /** Buffering/error state — only meaningful when `isCurrentPlayerEpisode`
   *  is true, same as `playing` (issues #82, #83). */
  loading?: boolean
  error?: boolean
  onPlayPause?: () => void
  /** Triggers the same retry action as the player bar's own retry button —
   *  only relevant when `isCurrentPlayerEpisode && error`. */
  onRetry?: () => void
  onBack?: () => void
  /** Current playback position — pass only when `isCurrentPlayerEpisode` is
   *  true, mirroring ShareDialog's own contract. Omitted entirely renders a
   *  beginning-only share (no "start at" option), which is correct when
   *  this episode isn't the one actually playing. Also drives the scrub
   *  bar/transport row below, which only render at all when
   *  `isCurrentPlayerEpisode` — scrubbing or skipping an episode that isn't
   *  loaded doesn't mean anything. */
  currentTime?: number
  duration?: number
  speed?: number
  /** Moves the actual <audio> element's playhead — wired to the player
   *  store's requestSeek, not a bare setCurrentTime (which would only
   *  update the displayed time everywhere, not real playback, since
   *  DetailPane has no <audio> ref of its own). Used by both the scrub bar
   *  and the ±15s/start/end skip buttons. */
  onRequestSeek?: (time: number) => void
  onSpeedChange?: (speed: number) => void
}

export default function DetailPane({
  episode, seasons, isCurrentPlayerEpisode, playing, loading, error, onPlayPause, onRetry, onBack,
  currentTime, duration, speed, onRequestSeek, onSpeedChange,
}: DetailPaneProps) {
  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
        <p>Select an episode to begin</p>
      </div>
    )
  }

  const season = seasons.find(s => s.id === episode.season_id)
  const seasonLabel = season ? `${season.title} · Episode ${episode.number}` : `Episode ${episode.number}`

  const guestList = episode.guests
    ? episode.guests.split(',').map(g => g.trim()).filter(Boolean)
    : []

  const tagList = episode.tags
    ? episode.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []

  return (
    <div className="p-4 md:p-8">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 flex h-11 items-center gap-1 -ml-2 px-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to episodes
        </button>
      )}
      <EpisodeCoverArt
        thumbPath={episode.cover_art_thumb_path}
        detailPath={episode.cover_art_path}
        alt={episode.title}
        variant="responsive"
        className="mb-6 w-48 aspect-square object-cover rounded-xl shadow-lg ring-1 ring-zinc-200 dark:ring-zinc-800"
      />
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{seasonLabel}</p>
        <ShareDialog
          episodeId={episode.id}
          episodeTitle={episode.title}
          currentTime={isCurrentPlayerEpisode ? currentTime : undefined}
          className="shrink-0"
        />
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{episode.title}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{episode.publish_date}</p>

      {onPlayPause && (() => {
        const showError = !!(isCurrentPlayerEpisode && error)
        const showLoading = !!(isCurrentPlayerEpisode && loading && !error)
        const showPause = !!(isCurrentPlayerEpisode && playing && !showError)
        return (
          <button
            onClick={showError ? onRetry : onPlayPause}
            // Distinct from the player bar's own "Play"/"Pause"/"Retry
            // playback" buttons — once both are on screen at once (this
            // episode is loaded and playing), an identical accessible name
            // on two different buttons is a real ambiguity for screen
            // readers and any role-based query, not just a testing
            // nuisance.
            aria-label={showError ? 'Retry episode' : (showPause ? 'Pause episode' : 'Play episode')}
            aria-busy={showLoading || undefined}
            className={`mt-4 flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90 ${showLoading ? 'opacity-60' : ''}`}
          >
            {showError ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.996 5.996 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                </svg>
                Retry
              </>
            ) : showPause ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pause
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </>
            )}
          </button>
        )
      })()}
      <PlaybackStatusLine
        status={getPlaybackStatus(episode, { loading: isCurrentPlayerEpisode && loading, error: isCurrentPlayerEpisode && error })}
        className="mt-2"
      />

      {isCurrentPlayerEpisode && duration !== undefined && currentTime !== undefined && speed !== undefined && onRequestSeek && onSpeedChange && (
        <div className="mt-4 max-w-sm space-y-2">
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={onRequestSeek} />
          <div className="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
            <span className="font-mono">{formatTime(currentTime)}</span>
            <span className="font-mono">{formatTime(currentTime - duration, true)}</span>
          </div>
          <TransportControls
            showPlayButton={false}
            speed={speed}
            onCycleSpeed={() => onSpeedChange(nextSpeed(speed))}
            onSkipStart={() => onRequestSeek(0)}
            onSkipEnd={() => onRequestSeek(duration)}
            onBack15={() => onRequestSeek(clampSeekTime(currentTime - 15, duration))}
            onForward15={() => onRequestSeek(clampSeekTime(currentTime + 15, duration))}
          />
        </div>
      )}

      {guestList.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {guestList.map(guest => (
            <PillBadge key={guest} label={guest} className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" />
          ))}
        </div>
      )}

      {tagList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {tagList.map(tag => (
            <PillBadge key={tag} label={tag} className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200" />
          ))}
        </div>
      )}

      {episode.description && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">About this episode</p>
          <p className="leading-relaxed text-zinc-600 dark:text-zinc-300">{episode.description}</p>
        </div>
      )}
    </div>
  )
}
