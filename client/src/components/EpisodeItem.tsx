import type { Episode } from '../types'
import EpisodeCoverArt from './EpisodeCoverArt'
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

interface EpisodeItemProps {
  episode: Episode
  isActive: boolean
  /** Whether this episode is the one currently playing (not just selected). */
  isPlaying?: boolean
  /** Seconds left, for an episode partially listened to. Renders "X left"
   *  in place of the plain total duration when present. */
  remainingSeconds?: number
  onClick: (episode: Episode) => void
}

export default function EpisodeItem({ episode, isActive, isPlaying = false, remainingSeconds, onClick }: EpisodeItemProps) {
  // Calmer row on mobile: bigger cover, one meta line, no inline guests (already
  // shown in DetailPane) — desktop keeps today's denser row unchanged.
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)

  const playedFraction = !isDesktop && remainingSeconds !== undefined && episode.duration_seconds > 0
    ? Math.min(1, Math.max(0, (episode.duration_seconds - remainingSeconds) / episode.duration_seconds))
    : undefined

  return (
    <button
      onClick={() => onClick(episode)}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-2 md:gap-2 ${
        isActive
          ? 'border-l-2 border-[var(--accent)] bg-zinc-200/60 text-zinc-900 dark:bg-zinc-800/60 dark:text-zinc-100'
          : 'hover:bg-zinc-100 text-zinc-600 dark:hover:bg-zinc-800 dark:text-zinc-300'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-zinc-200 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-800 md:h-10 md:w-10">
        <EpisodeCoverArt
          thumbPath={episode.cover_art_thumb_path}
          detailPath={null}
          alt=""
          variant="thumb"
          className="h-full w-full object-cover"
        />
        {playedFraction !== undefined && playedFraction > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-black/40">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${playedFraction * 100}%` }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">Ep {episode.number}</span>
          <span className="text-sm font-medium truncate">{episode.title}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{episode.publish_date}</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
          {remainingSeconds !== undefined ? (
            <span className="text-xs text-[var(--accent)] shrink-0">
              <span className="tabular-nums">{formatDuration(remainingSeconds)}</span> left
            </span>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{formatDuration(episode.duration_seconds)}</span>
          )}
          {isDesktop && episode.guests ? (
            <>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 italic truncate min-w-0">{episode.guests}</span>
            </>
          ) : null}
        </div>
      </div>
      {isPlaying && (
        <div className="eq-bars flex items-end gap-px h-4 shrink-0 mt-1">
          <div className="eq-bar w-1 bg-[var(--accent)] rounded-sm h-full" />
          <div className="eq-bar w-1 bg-[var(--accent)] rounded-sm h-full" />
          <div className="eq-bar w-1 bg-[var(--accent)] rounded-sm h-full" />
        </div>
      )}
    </button>
  )
}
