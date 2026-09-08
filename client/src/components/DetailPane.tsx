import type { Episode, Season } from '../types'
import EpisodeCoverArt from './EpisodeCoverArt'
import PlaybackStatusLine from './PlaybackStatusLine'
import ShareDialog from './ShareDialog'
import { getPlaybackStatus } from '../utils/playbackStatus'
import { formatTime, clampSeekTime, nextSpeed } from '../utils/playback'
import { getEpisodeProgress } from '../utils/episodeProgress'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

interface DetailPaneProps {
  episode: Episode | null
  seasons: Season[]
  /** Podcast name — rendered as the small watermark label on the cover-art
   *  placeholder graphic (mockup's `.art-mark`), visible only where the
   *  real cover-art image doesn't fully cover it (i.e. no art uploaded). */
  podcastName?: string
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

function playStateLabel(episode: Episode, isCurrentPlayerEpisode: boolean | undefined, playing: boolean | undefined): string {
  if (isCurrentPlayerEpisode) return playing ? 'Now playing' : 'Paused'
  return getEpisodeProgress(episode.id) !== undefined ? 'In progress' : 'Not yet played'
}

function GuestsLine({ guests }: { guests: string }) {
  const guestList = guests.split(',').map(g => g.trim()).filter(Boolean)
  if (guestList.length === 0) return null
  return (
    <p className="guests">
      With {guestList.map((guest, i) => (
        <span key={guest}>
          <strong>{guest}</strong>
          {i < guestList.length - 1 ? ', ' : ''}
        </span>
      ))}
    </p>
  )
}

/** The mockup's decorative concentric-ring cover-art background — always
 *  rendered behind the real image, matching the mockup's `.art` (it's the
 *  card the photo sits on, not a fallback swapped in for a missing one).
 *  Visible only where the real image (when present) doesn't cover it. */
function ArtBackground({ podcastName, episodeNo }: { podcastName?: string; episodeNo: number }) {
  return (
    <>
      <div className="rings" aria-hidden="true" />
      <div className="ring-accent" aria-hidden="true" />
      <div className="ring-accent two" aria-hidden="true" />
      <div className="origin" aria-hidden="true" />
      {podcastName && <span className="art-mark">{podcastName}</span>}
      <span className="art-no">{episodeNo}</span>
    </>
  )
}

export default function DetailPane({
  episode, seasons, podcastName, isCurrentPlayerEpisode, playing, loading, error, onPlayPause, onRetry, onBack,
  currentTime, duration, speed, onRequestSeek, onSpeedChange,
}: DetailPaneProps) {
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)

  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-ink-3">
        <p>Select an episode to begin</p>
      </div>
    )
  }

  const season = seasons.find(s => s.id === episode.season_id)
  const seasonLabel = season ? season.title : ''

  const showError = !!(isCurrentPlayerEpisode && error)
  const showLoading = !!(isCurrentPlayerEpisode && loading && !error)
  const showPause = !!(isCurrentPlayerEpisode && playing && !showError)

  const playButton = onPlayPause && (
    <button
      onClick={showError ? onRetry : onPlayPause}
      // Distinct from the player bar's own "Play"/"Pause"/"Retry playback"
      // buttons — once both are on screen at once (this episode is loaded
      // and playing), an identical accessible name on two different
      // buttons is a real ambiguity for screen readers and any role-based
      // query, not just a testing nuisance.
      aria-label={showError ? 'Retry episode' : (showPause ? 'Pause episode' : 'Play episode')}
      aria-busy={showLoading || undefined}
      className={`play-primary ${showLoading ? 'opacity-60' : ''}`}
    >
      {/* text-[var(--accent-contrast)]: .play-disc sets no `color` of its
          own, so RetryIcon's fill="currentColor" would otherwise inherit
          the ambient ink color instead of a contrasting one against the
          accent-filled circle (the other two icons hardcode fill="#fff"
          and are unaffected). */}
      <span className="play-disc text-[var(--accent-contrast)]" aria-hidden="true">
        {showError ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.996 5.996 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
        ) : showPause ? (
          <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">
            <rect width="4.1" height="15" rx="1" fill="#fff" />
            <rect x="8.9" width="4.1" height="15" rx="1" fill="#fff" />
          </svg>
        ) : (
          <svg width="17" height="19" viewBox="0 0 17 19" fill="none" aria-hidden="true">
            <path d="M1 1.6v15.8a1 1 0 0 0 1.52.86l13.2-7.9a1 1 0 0 0 0-1.72L2.52.74A1 1 0 0 0 1 1.6Z" fill="#fff" />
          </svg>
        )}
      </span>
      <span className="play-word">
        {showError ? 'Retry' : showPause ? 'Pause' : 'Play'}
        <span className="play-sub">{Math.round(episode.duration_seconds / 60)} min</span>
      </span>
    </button>
  )

  const inlineTransport = isCurrentPlayerEpisode && duration !== undefined && currentTime !== undefined && speed !== undefined && onRequestSeek && onSpeedChange && (
    <div className="m-now-controls show">
      <div
        className="m-np-scrub"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          onRequestSeek(clampSeekTime(((e.clientX - rect.left) / rect.width) * duration, duration))
        }}
      >
        <div className="fill" style={{ width: duration ? `${Math.min(100, (currentTime / duration) * 100)}%` : '0%' }} />
      </div>
      <div className="m-np-times">
        <span className="mono">{formatTime(currentTime)}</span>
        <span className="mono">{formatTime(duration)}</span>
      </div>
      <div className="m-np-transport">
        <button className="m-np-skip" onClick={() => onRequestSeek(clampSeekTime(currentTime - 15, duration))} aria-label="Back 15 seconds">
          <svg width="24" height="24" viewBox="0 0 21 21" fill="none" aria-hidden="true">
            <path d="M10.5 5.2A6.6 6.6 0 1 1 4.6 8.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M7.6 2.5 4.2 5.6l3.4 2.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="m-np-speed mono" onClick={() => onSpeedChange(nextSpeed(speed))} aria-label="Playback speed">{speed}×</button>
        <button className="m-np-skip" onClick={() => onRequestSeek(clampSeekTime(currentTime + 15, duration))} aria-label="Forward 15 seconds">
          <svg width="24" height="24" viewBox="0 0 21 21" fill="none" aria-hidden="true">
            <path d="M10.5 5.2A6.6 6.6 0 1 0 16.4 8.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M13.4 2.5l3.4 3.1-3.4 2.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <PlaybackStatusLine
        status={getPlaybackStatus(episode, { loading, error })}
        className="m-np-status mono"
      />
    </div>
  )

  if (!isDesktop) {
    // No .m-pane wrapper here — AppShell provides it uniformly around
    // whichever mobile pane is rendered (list/detail/settings).
    return (
      <>
        {onBack && (
          // aria-label distinct from the visible "Episodes" text: the mobile
          // tab bar's own "Episodes" tab can be on screen at the same time
          // (this back button and that tab are different controls with the
          // same visible copy, per the mockup) — an identical accessible
          // name on two different buttons is the same ambiguity already
          // fixed once for the Play/Pause buttons (see DetailPane's play
          // button below, and CLAUDE.md gotcha #41).
          <button onClick={onBack} className="m-back" aria-label="Back to episodes">
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
              <path d="M6 1 1 6l5 5M1.5 6H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Episodes
          </button>
        )}

        <div className="art m-art">
          <ArtBackground podcastName={podcastName} episodeNo={episode.number} />
          <EpisodeCoverArt
            thumbPath={episode.cover_art_thumb_path}
            detailPath={episode.cover_art_path}
            alt={episode.title}
            variant="responsive"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <p className="label">{seasonLabel} &nbsp;·&nbsp; Episode {episode.number}</p>
          <ShareDialog
            episodeId={episode.id}
            episodeTitle={episode.title}
            currentTime={isCurrentPlayerEpisode ? currentTime : undefined}
          />
        </div>
        <h1 className="m-detail-title">{episode.title}</h1>
        <p className="m-detail-meta">
          <span>{episode.publish_date}</span><span className="dot">·</span><span>{formatTime(episode.duration_seconds)}</span>
        </p>

        <div className="m-detail-controls">{playButton}</div>

        {inlineTransport}

        {episode.description && <p className="m-desc">{episode.description}</p>}
        {episode.guests && <GuestsLine guests={episode.guests} />}
      </>
    )
  }

  return (
    <div>
      <div className="stage-head">
        <div className="art" data-stage-art>
          <ArtBackground podcastName={podcastName} episodeNo={episode.number} />
          <EpisodeCoverArt
            thumbPath={episode.cover_art_thumb_path}
            detailPath={episode.cover_art_path}
            alt={episode.title}
            variant="responsive"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div>
          <div className="stage-top-row">
            <p className="eyebrow label">{seasonLabel} &nbsp;·&nbsp; Episode {episode.number}</p>
            <ShareDialog
              episodeId={episode.id}
              episodeTitle={episode.title}
              currentTime={isCurrentPlayerEpisode ? currentTime : undefined}
            />
          </div>
          <h2 className="ep-title">{episode.title}</h2>
          <p className="ep-meta">
            <span>{episode.publish_date}</span> <span className="dot">·</span> <span>{formatTime(episode.duration_seconds)}</span> <span className="dot">·</span> <span>{playStateLabel(episode, isCurrentPlayerEpisode, playing)}</span>
          </p>

          <div className="controls">{playButton}</div>
          <PlaybackStatusLine
            status={getPlaybackStatus(episode, { loading: isCurrentPlayerEpisode && loading, error: isCurrentPlayerEpisode && error })}
            className="mt-2"
          />
          {/* No inline scrub/skip/speed row on desktop — confirmed against
              the mockup's actual markup, transport controls exist only in
              the fixed dock here (plans/010 Step 4). */}
        </div>
      </div>

      <div className="stage-body">
        <p className="body-label label">About</p>
        <div>
          {episode.description && <p className="description">{episode.description}</p>}
          {episode.guests && <GuestsLine guests={episode.guests} />}
        </div>
      </div>
    </div>
  )
}
