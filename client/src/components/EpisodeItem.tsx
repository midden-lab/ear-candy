import type { Episode } from '../types'

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
  /** Small inline label (e.g. "S9") showing this episode's origin season —
   *  only passed for cross-catalog search results, where rows from
   *  multiple seasons appear in one flattened list and need a way to tell
   *  them apart at a glance. Omitted in normal season-scoped browsing. */
  seasonTag?: string
  onClick: (episode: Episode) => void
}

/**
 * A single episode row, matching the mockup's actual row template exactly
 * (confirmed against its rendering JS, not just its CSS) — three fields
 * only (number, title, time), identical on desktop and mobile. No cover-art
 * thumbnail: a prior plan (008) had deliberately kept one on mobile as a
 * deviation from the mockup, but this direct-port pass drops it per an
 * explicit decision to match the mockup exactly instead (plans/010).
 */
export default function EpisodeItem({ episode, isActive, isPlaying = false, remainingSeconds, seasonTag, onClick }: EpisodeItemProps) {
  const isPartial = remainingSeconds !== undefined && !isPlaying

  const rowClass = ['row', isActive && 'is-viewed', isPlaying && 'is-playing', isPartial && 'partial']
    .filter(Boolean)
    .join(' ')

  return (
    <button onClick={() => onClick(episode)} className={rowClass} aria-current={isActive ? 'true' : undefined}>
      <span className="row-no">{episode.number}</span>
      <span className="row-title">
        {seasonTag && <span className="row-season-tag-inline">{seasonTag}</span>}
        {episode.title}
      </span>
      <span className="row-time">
        {isPlaying && (
          <span className="eq-bars mr-1.5 inline-flex h-3 items-end gap-px align-middle" aria-hidden="true">
            <span className="eq-bar h-full w-0.5 rounded-sm bg-[var(--accent)]" />
            <span className="eq-bar h-full w-0.5 rounded-sm bg-[var(--accent)]" />
            <span className="eq-bar h-full w-0.5 rounded-sm bg-[var(--accent)]" />
          </span>
        )}
        {remainingSeconds !== undefined ? `${formatDuration(remainingSeconds)} left` : formatDuration(episode.duration_seconds)}
      </span>
    </button>
  )
}
