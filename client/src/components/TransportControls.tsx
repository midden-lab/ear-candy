export function RetryIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.996 5.996 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  )
}

export interface TransportControlsProps {
  playing?: boolean
  onTogglePlay?: () => void
  onSkipStart: () => void
  onSkipEnd: () => void
  onBack15: () => void
  onForward15: () => void
  speed: number
  onCycleSpeed: () => void
  /** Bumps skip/speed touch targets to >=44px for the mobile full-screen overlay. */
  large?: boolean
  /** True while buffering (native waiting/stalled events) — dims the
   *  central button but leaves it clickable, so pausing can still cancel a
   *  slow buffering attempt (issue #82). */
  loading?: boolean
  /** True after a real playback failure — swaps the central button to a
   *  retry action instead of play/pause (issue #83). */
  error?: boolean
  onRetry?: () => void
  /** Hide the central circular play/pause/retry button — for a host (e.g.
   *  DetailPane) that already renders its own distinctly-labeled Play/
   *  Pause/Retry control elsewhere and would otherwise show two redundant
   *  ones side by side. Defaults to true, matching AudioPlayerView's own
   *  usages, which have no other play control anywhere in their layout. */
  showPlayButton?: boolean
}

export default function TransportControls({
  playing, onTogglePlay, onSkipStart, onSkipEnd, onBack15, onForward15, speed, onCycleSpeed, large,
  loading, error, onRetry, showPlayButton = true,
}: TransportControlsProps) {
  const btnClass = large
    ? 'flex h-11 w-11 items-center justify-center rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'
    : 'rounded p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'
  const isLoading = !!loading && !error

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
      {showPlayButton && (
        <button
          onClick={error ? onRetry : onTogglePlay}
          className={`rounded-full bg-[var(--accent)] p-3 text-[var(--accent-contrast)] transition-opacity hover:opacity-90 ${isLoading ? 'opacity-60' : ''}`}
          aria-label={error ? 'Retry playback' : (playing ? 'Pause' : 'Play')}
          aria-busy={isLoading || undefined}
        >
          {error ? (
            <RetryIcon size={20} />
          ) : playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      )}
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
