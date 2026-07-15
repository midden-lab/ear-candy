import type { Episode } from '../types'
import EpisodeCoverArt from './EpisodeCoverArt'

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
  return (
    <button
      onClick={() => onClick(episode)}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-2 ${
        isActive
          ? 'border-l-2 border-[var(--accent)] bg-zinc-200/60 text-zinc-900 dark:bg-zinc-800/60 dark:text-zinc-100'
          : 'hover:bg-zinc-100 text-zinc-600 dark:hover:bg-zinc-800 dark:text-zinc-300'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-200 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-800">
        <EpisodeCoverArt
          thumbPath={episode.cover_art_thumb_path}
          detailPath={null}
          alt=""
          variant="thumb"
          className="h-full w-full object-cover"
        />
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
          {episode.guests ? (
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
