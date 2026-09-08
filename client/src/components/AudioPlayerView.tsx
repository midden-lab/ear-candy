import { useEffect, useLayoutEffect, useRef, type Ref } from 'react'
import type { Episode, Season } from '../types'
import { RetryIcon } from './RetryIcon'
import PlaybackStatusLine from './PlaybackStatusLine'
import { getPlaybackStatus } from '../utils/playbackStatus'
import { formatTime, clampSeekTime, nextSpeed } from '../utils/playback'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

export interface AudioPlayerViewProps {
  episode: Episode | null
  /** Used only to build the dock/mini-player's subtitle line (season title
   *  · episode number · guests, matching the mockup's `.now-sub` exactly).
   *  Defaults to empty so callers that don't pass it see no behavior
   *  change beyond an incomplete subtitle. */
  seasons?: Season[]
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  /** Position (seconds) to seek to when this episode is first loaded, e.g. a
   *  previously-saved partial-listen position. Only applied once, right when
   *  `episode` changes — never re-applied on later re-renders of the same
   *  episode. Omit/0 for "start from the beginning". */
  resumeTime?: number
  /** True while the browser is buffering and can't yet fulfil a play()
   *  attempt (issue #82). */
  loading?: boolean
  /** True after a real playback failure (issue #83). */
  error?: boolean
  /** Bumped (any change in value) to signal "reload and retry playback now"
   *  — the actual retry side effect (audio.load()/play()) happens inside
   *  this component, since only it holds the <audio> ref; the host just
   *  needs to be able to trigger it from wherever its own retry button
   *  lives (which may not be this component at all — e.g. DetailPane). */
  retrySignal?: number
  /** Set (a new object, with an incremented `nonce`) to request a seek to
   *  `time` from outside this component — e.g. DetailPane's own scrub bar,
   *  which has no <audio> ref of its own. Mirrors the retrySignal pattern:
   *  a plain prop change the host can react to via setCurrentTime/onSeek
   *  alone would update the *displayed* time everywhere without touching
   *  real playback, since only this component's effect actually applies a
   *  seek to the underlying element. */
  seekRequest?: { time: number; nonce: number }
  /** Fired when the mobile mini-bar itself is tapped, outside its own
   *  Play/Pause button — the host decides what that means (this component
   *  no longer has its own full-screen "now playing" state; navigating to
   *  a shared detail view is the host's job, e.g. App.tsx's
   *  handleViewPlaying). No-op on desktop, which has no mini-bar. */
  onTapMiniBar?: () => void
  /** Fired after the view has moved the underlying <audio> element's playhead. */
  onSeek: (time: number) => void
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
  onTimeUpdate: (time: number) => void
  onDurationChange: (duration: number) => void
  onEnded: () => void
  /** Native `waiting`/`stalled` — playback attempted but not enough data yet. */
  onWaiting?: () => void
  /** Native `playing` — playback actually resumed; clears both loading and error. */
  onPlaybackResumed?: () => void
  /** Native `error` — playback genuinely failed. */
  onPlaybackError?: () => void
  /** Called once per actual episode swap, before loading the new source —
   *  lets the host clear any stale loading/error state left over from the
   *  previous episode. */
  onReset?: () => void
  /** Called when a retry action is triggered from within this component
   *  (the transport button or mini-bar, when in the error state) — maps to
   *  the host's own retry state action (e.g. bumping the value it later
   *  passes back in as `retrySignal`). */
  onRetry?: () => void
  /** The player's own rendered height in px, whenever it changes. Lets a host
   *  layout (e.g. this app's AppShell) reserve exactly enough space below the
   *  fixed player bar — this component makes no assumption about how, or
   *  whether, its host uses that value. */
  onHeightChange?: (px: number) => void
}

/**
 * Fully self-contained audio player: owns the real <audio> element and its
 * playback wiring (play/pause, seek, speed, load-on-episode-change), and
 * renders as a desktop bar or a mobile mini-bar depending on viewport.
 * Playback position/duration/playing/speed are controlled via props so
 * this component has no dependency on any particular app's state
 * management — the host wires it to whatever store it likes. On mobile,
 * this is deliberately just a mini-bar with no full-screen state of its
 * own — the host's "Playing" destination (e.g. App.tsx's detail pane) is
 * where a listener actually goes to see more, reached via onTapMiniBar.
 */
export default function AudioPlayerView({
  episode, seasons = [], playing, currentTime, duration, speed, resumeTime, loading, error, retrySignal, seekRequest,
  onTapMiniBar,
  onSeek, onTogglePlay, onSpeedChange, onTimeUpdate, onDurationChange, onEnded,
  onWaiting, onPlaybackResumed, onPlaybackError, onReset, onRetry, onHeightChange,
}: AudioPlayerViewProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  // HTMLElement, not HTMLDivElement: the mobile mini-bar's root is a
  // <button> (matches the mockup's whole-row-clickable .m-miniplayer),
  // while the desktop dock's is a <div> — only .offsetHeight is ever read
  // off this ref, so the common HTMLElement type is all that's needed.
  const barRef = useRef<HTMLElement>(null)
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !episode) return
    // Clear any stale loading/error state left over from whatever was
    // previously loaded — otherwise a listener who hits an error on one
    // episode, then switches to another, would see the old error message
    // hanging around on an episode it never actually applied to.
    onReset?.()
    audio.src = episode.audio_path
    audio.load()
    // Browsers queue a currentTime assignment made before metadata has
    // loaded and apply it once it does — no need to wait for
    // `loadedmetadata` here. Reads `resumeTime` intentionally without
    // depending on it: this must apply once per actual episode swap, not
    // re-fire as `resumeTime` keeps changing for the same playing episode
    // (it's recomputed from ever-advancing saved progress).
    if (resumeTime) audio.currentTime = resumeTime
    // A same-value `playing: true -> true` write (e.g. switching episodes
    // while already playing) never re-triggers the [playing] effect below,
    // so without this, load()'s implicit pause is never followed by a real
    // play() call — the store still says playing, but the element sits
    // paused. Reads `playing` intentionally without depending on it: this
    // effect must fire only on an actual episode swap, not on every
    // play/pause toggle (that's the [playing] effect's job below).
    if (playing) void audio.play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) void audio.play()
    else audio.pause()
  }, [playing])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  // Reloading and re-attempting play() is the actual retry mechanism — only
  // this component holds the <audio> ref, so it reacts to `retrySignal`
  // changing (bumped by whichever button the host's retry action lives
  // behind) rather than exposing an imperative retry function for callers
  // to invoke directly (issue #83).
  const prevRetrySignalRef = useRef(retrySignal)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !episode) return
    if (retrySignal !== undefined && retrySignal !== prevRetrySignalRef.current) {
      prevRetrySignalRef.current = retrySignal
      audio.load()
      void audio.play()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrySignal])

  // Applying a seek requested from outside this component (e.g. DetailPane's
  // scrub bar) requires actually touching the <audio> element, not just
  // updating the host's own displayed currentTime — same reasoning as
  // retrySignal above, and the same nonce-comparison shape.
  const prevSeekNonceRef = useRef(seekRequest?.nonce)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !episode || !seekRequest) return
    if (seekRequest.nonce !== prevSeekNonceRef.current) {
      prevSeekNonceRef.current = seekRequest.nonce
      audio.currentTime = seekRequest.time
      onSeek(seekRequest.time)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest])

  // Feed the player's actual rendered height to the host via onHeightChange,
  // whenever it changes. Zero when nothing should reserve space (no episode).
  useLayoutEffect(() => {
    if (!episode) {
      onHeightChange?.(0)
      return
    }
    const el = barRef.current
    if (!el) return
    const update = () => onHeightChange?.(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      onHeightChange?.(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onHeightChange is expected to be a stable callback
  }, [episode])

  const handleSeek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
    onSeek(time)
  }

  const skipTo = (time: number) => {
    handleSeek(clampSeekTime(time, duration))
  }

  const cycleSpeed = () => {
    onSpeedChange(nextSpeed(speed))
  }

  if (!episode) return null

  const playbackStatus = getPlaybackStatus(episode, { loading, error })
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const isLoading = !!loading && !error
  // Matches the mockup's own .now-sub text exactly (confirmed against its
  // render() function): season title · episode number · guests, joined by
  // " · ", any missing piece simply omitted rather than leaving a dangling
  // separator.
  const season = seasons.find(s => s.id === episode.season_id)
  const nowSub = [season?.title, episode.number, episode.guests].filter(Boolean).join(' · ')

  const audioEl = (
    <audio
      ref={audioRef}
      onTimeUpdate={() => onTimeUpdate(audioRef.current?.currentTime ?? 0)}
      onDurationChange={() => onDurationChange(audioRef.current?.duration ?? 0)}
      onEnded={onEnded}
      // `stalled` (fetch unexpectedly stopped making progress) is treated
      // the same as `waiting` (not enough data buffered to continue) —
      // both are "still trying, not yet a real failure" (issue #82).
      // `playing` (native event, not the `playing` prop) fires when
      // playback actually resumes, clearing both loading and error state.
      // `error` is a genuine failure (issue #83).
      onWaiting={() => onWaiting?.()}
      onStalled={() => onWaiting?.()}
      onPlaying={() => onPlaybackResumed?.()}
      onError={() => onPlaybackError?.()}
    />
  )

  const playIcon = error ? (
    <RetryIcon size={16} />
  ) : playing ? (
    <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">
      <rect width="4.1" height="15" rx="1" fill="#fff" />
      <rect x="8.9" width="4.1" height="15" rx="1" fill="#fff" />
    </svg>
  ) : (
    <svg width="17" height="19" viewBox="0 0 17 19" fill="none" aria-hidden="true">
      <path d="M1 1.6v15.8a1 1 0 0 0 1.52.86l13.2-7.9a1 1 0 0 0 0-1.72L2.52.74A1 1 0 0 0 1 1.6Z" fill="#fff" />
    </svg>
  )

  // Mobile: compact mini-bar. Tapping it (outside the Play/Pause button)
  // navigates to the host's own "Playing" destination via onTapMiniBar —
  // this component no longer owns any full-screen state of its own.
  // Matches the mockup's .m-miniplayer exactly, including using the same
  // decorative .chip graphic as the desktop dock rather than real cover
  // art — the settled design confines actual photography to the detail
  // view's hero .art only (plans/010, same principle as dropping row
  // thumbnails).
  if (!isDesktop) {
    return (
      <button
        ref={barRef as Ref<HTMLButtonElement>}
        data-testid="player-bar"
        onClick={() => onTapMiniBar?.()}
        className="m-miniplayer w-full text-left"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--tabbar-h, 0px)' }}
        aria-label={`Now playing: ${episode.title}. Tap to view.`}
      >
        {audioEl}
        <div className="m-mini-progress" aria-hidden="true">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="chip" aria-hidden="true"><div className="rings" /><div className="origin" /></div>
        <div className="now-text">
          <div className="now-title">{episode.title}</div>
          <div className="now-sub">{nowSub}</div>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); if (error) onRetry?.(); else onTogglePlay() }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation(); e.preventDefault()
              if (error) onRetry?.(); else onTogglePlay()
            }
          }}
          className={`m-mini-play text-[var(--accent-contrast)] ${isLoading ? 'opacity-60' : ''}`}
          aria-label={error ? 'Retry playback' : (playing ? 'Pause' : 'Play')}
          aria-busy={isLoading || undefined}
        >
          {playIcon}
        </span>
      </button>
    )
  }

  // Desktop: full player bar (also the default when isDesktop is unknown,
  // e.g. in tests that don't mock matchMedia).
  return (
    <div ref={barRef as Ref<HTMLDivElement>} data-testid="player-bar" className="dock" aria-label="Player">
      {audioEl}
      <div
        className="scrub"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          handleSeek(clampSeekTime(((e.clientX - rect.left) / rect.width) * duration, duration))
        }}
      >
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="knob" style={{ left: `${pct}%` }} />
      </div>

      <div className="dock-inner">
        <div className="now">
          <div className="chip" aria-hidden="true"><div className="rings" /><div className="origin" /></div>
          <div className="now-text">
            <div className="now-title">{episode.title}</div>
            <div className="now-sub">{nowSub}</div>
          </div>
        </div>

        <div className="transport">
          <button className="skip" onClick={() => skipTo(currentTime - 15)} aria-label="Back 15 seconds">
            <svg width="21" height="21" viewBox="0 0 21 21" fill="none" aria-hidden="true">
              <path d="M10.5 5.2A6.6 6.6 0 1 1 4.6 8.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
              <path d="M7.6 2.5 4.2 5.6l3.4 2.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            className={`pause-disc text-[var(--accent-contrast)] ${isLoading ? 'opacity-60' : ''}`}
            onClick={error ? onRetry : onTogglePlay}
            aria-label={error ? 'Retry playback' : (playing ? 'Pause' : 'Play')}
            aria-busy={isLoading || undefined}
          >
            {playIcon}
          </button>

          <button className="skip" onClick={() => skipTo(currentTime + 15)} aria-label="Forward 15 seconds">
            <svg width="21" height="21" viewBox="0 0 21 21" fill="none" aria-hidden="true">
              <path d="M10.5 5.2A6.6 6.6 0 1 0 16.4 8.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
              <path d="M13.4 2.5l3.4 3.1-3.4 2.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="dock-right">
          <span className="times mono">
            <span>{formatTime(currentTime)}</span> <span className="total">/ {formatTime(duration)}</span>
          </span>
          <button className="speed" onClick={cycleSpeed} aria-label="Playback speed">{speed}×</button>
        </div>
      </div>

      <PlaybackStatusLine status={playbackStatus} size="xs" className="status" />
    </div>
  )
}
