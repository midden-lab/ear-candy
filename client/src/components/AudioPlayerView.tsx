import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Episode } from '../types'
import ProgressBar from './ProgressBar'
import EpisodeCoverArt from './EpisodeCoverArt'
import ShareDialog from './ShareDialog'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

function formatTime(seconds: number, showSign = false): string {
  const abs = Math.floor(Math.abs(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  const str = `${m}:${String(s).padStart(2, '0')}`
  return showSign && seconds < 0 ? `-${str}` : str
}

const SPEEDS = [1, 1.5, 2] as const

interface TransportControlsProps {
  playing: boolean
  onTogglePlay: () => void
  onSkipStart: () => void
  onSkipEnd: () => void
  onBack15: () => void
  onForward15: () => void
  speed: number
  onCycleSpeed: () => void
  /** Bumps skip/speed touch targets to >=44px for the mobile full-screen overlay. */
  large?: boolean
}

function TransportControls({
  playing, onTogglePlay, onSkipStart, onSkipEnd, onBack15, onForward15, speed, onCycleSpeed, large,
}: TransportControlsProps) {
  const btnClass = large
    ? 'flex h-11 w-11 items-center justify-center rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'
    : 'rounded p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'

  return (
    <div className="flex items-center justify-center gap-3">
      <button onClick={onSkipStart} className={btnClass} aria-label="Skip to start">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
        </svg>
      </button>
      <button onClick={onBack15} className={btnClass} aria-label="Back 15 seconds">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8.01-8z"/>
        </svg>
      </button>
      <button
        onClick={onTogglePlay}
        className="rounded-full bg-[var(--accent)] p-3 text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <button onClick={onForward15} className={btnClass} aria-label="Forward 15 seconds">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
        </svg>
      </button>
      <button onClick={onSkipEnd} className={btnClass} aria-label="Skip to end">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z"/>
        </svg>
      </button>
      <button
        onClick={onCycleSpeed}
        className={`${large ? 'flex h-11 min-w-[2.75rem] items-center justify-center' : 'px-2 py-1 min-w-[2.5rem]'} rounded text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors text-center`}
        aria-label="Playback speed"
      >
        {speed}×
      </button>
    </div>
  )
}

export interface AudioPlayerViewProps {
  episode: Episode | null
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  /** Position (seconds) to seek to when this episode is first loaded, e.g. a
   *  previously-saved partial-listen position. Only applied once, right when
   *  `episode` changes — never re-applied on later re-renders of the same
   *  episode. Omit/0 for "start from the beginning". */
  resumeTime?: number
  /** Fired after the view has moved the underlying <audio> element's playhead. */
  onSeek: (time: number) => void
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
  onTimeUpdate: (time: number) => void
  onDurationChange: (duration: number) => void
  onEnded: () => void
  /** The player's own rendered height in px, whenever it changes. Lets a host
   *  layout (e.g. this app's AppShell) reserve exactly enough space below the
   *  fixed player bar — this component makes no assumption about how, or
   *  whether, its host uses that value. */
  onHeightChange?: (px: number) => void
}

/**
 * Fully self-contained audio player: owns the real <audio> element and its
 * playback wiring (play/pause, seek, speed, load-on-episode-change), and
 * renders as a desktop bar, a mobile mini-bar, or a mobile full-screen
 * "now playing" overlay depending on viewport and its own expand/collapse
 * state. Playback position/duration/playing/speed are controlled via props
 * so this component has no dependency on any particular app's state
 * management — the host wires it to whatever store it likes.
 */
export default function AudioPlayerView({
  episode, playing, currentTime, duration, speed, resumeTime,
  onSeek, onTogglePlay, onSpeedChange, onTimeUpdate, onDurationChange, onEnded, onHeightChange,
}: AudioPlayerViewProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)
  const [expanded, setExpanded] = useState(false)

  // Collapse back to the mini-bar once playback stops entirely (no
  // episode), so a later episode selection doesn't reopen the overlay from
  // stale state. Adjusted during render (React's documented pattern for
  // resetting state on a prop change) rather than in an effect.
  const prevEpisodeIdRef = useRef(episode?.id)
  if (episode?.id !== prevEpisodeIdRef.current) {
    prevEpisodeIdRef.current = episode?.id
    if (!episode && expanded) setExpanded(false)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !episode) return
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

  const isFullScreenOverlay = !isDesktop && expanded

  // Feed the player's actual rendered height to the host via onHeightChange,
  // whenever it changes. Zero when nothing should reserve space (no
  // episode, or the full-screen overlay is covering everything anyway).
  useLayoutEffect(() => {
    if (!episode || isFullScreenOverlay) {
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
  }, [episode, isFullScreenOverlay])

  const handleSeek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
    onSeek(time)
  }

  const skipTo = (time: number) => {
    handleSeek(Math.max(0, Math.min(time, duration)))
  }

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as typeof SPEEDS[number])
    onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length])
  }

  if (!episode) return null

  const remaining = currentTime - duration

  const audioEl = (
    <audio
      ref={audioRef}
      onTimeUpdate={() => onTimeUpdate(audioRef.current?.currentTime ?? 0)}
      onDurationChange={() => onDurationChange(audioRef.current?.duration ?? 0)}
      onEnded={onEnded}
    />
  )

  const transportProps = {
    playing,
    onTogglePlay,
    onSkipStart: () => skipTo(0),
    onSkipEnd: () => skipTo(duration),
    onBack15: () => skipTo(currentTime - 15),
    onForward15: () => skipTo(currentTime + 15),
    speed,
    onCycleSpeed: cycleSpeed,
  }

  // Mobile, collapsed: compact mini-bar.
  if (!isDesktop && !expanded) {
    return (
      <div
        ref={barRef}
        data-testid="player-bar"
        className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {audioEl}
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-3 px-4 py-2 text-left"
          aria-label={`Now playing: ${episode.title}. Tap to expand.`}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{episode.title}</div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: duration ? `${Math.min(100, (currentTime / duration) * 100)}%` : '0%' }}
              />
            </div>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onTogglePlay() }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onTogglePlay() }
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </span>
        </button>
      </div>
    )
  }

  // Mobile, expanded: full-screen "now playing" overlay.
  if (!isDesktop && expanded) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-zinc-50 dark:bg-zinc-950 transition-transform duration-300 motion-reduce:transition-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {audioEl}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setExpanded(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            aria-label="Collapse now playing"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {/* ShareDialog's own trigger is already a 44px (h-11 w-11) touch
              target by default — no per-usage size override needed here. */}
          <ShareDialog episodeId={episode.id} episodeTitle={episode.title} currentTime={currentTime} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-6">
          <EpisodeCoverArt
            thumbPath={episode.cover_art_thumb_path}
            detailPath={episode.cover_art_path}
            alt={episode.title}
            variant="responsive"
            className="w-full max-w-xs aspect-square object-cover rounded-xl shadow-lg ring-1 ring-zinc-200 dark:ring-zinc-800"
          />
          <div className="w-full max-w-xs text-center">
            <div className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">{episode.title}</div>
          </div>
          <div className="w-full max-w-xs space-y-2">
            <ProgressBar currentTime={currentTime} duration={duration} onSeek={handleSeek} />
            <div className="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(remaining, true)}</span>
            </div>
          </div>
          <TransportControls {...transportProps} large />
        </div>
      </div>
    )
  }

  // Desktop: full player bar (also the default when isDesktop is unknown,
  // e.g. in tests that don't mock matchMedia).
  return (
    <div ref={barRef} data-testid="player-bar" className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-6 py-3">
      {audioEl}
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <EpisodeCoverArt
          thumbPath={episode.cover_art_thumb_path}
          detailPath={episode.cover_art_path}
          alt={episode.title}
          variant="thumb"
          className="h-10 w-10 shrink-0 rounded object-cover ring-1 ring-zinc-200 dark:ring-zinc-800"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{episode.title}</div>
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={handleSeek} />
          <div className="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(remaining, true)}</span>
          </div>
          <TransportControls {...transportProps} />
        </div>
        <ShareDialog episodeId={episode.id} episodeTitle={episode.title} currentTime={currentTime} className="shrink-0 self-center" />
      </div>
    </div>
  )
}
