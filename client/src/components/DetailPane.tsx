import type { Episode, Season } from '../types'
import PillBadge from './PillBadge'
import EpisodeCoverArt from './EpisodeCoverArt'

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
  onPlayPause?: () => void
  onBack?: () => void
}

export default function DetailPane({ episode, seasons, isCurrentPlayerEpisode, playing, onPlayPause, onBack }: DetailPaneProps) {
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
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{seasonLabel}</p>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{episode.title}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{episode.publish_date}</p>

      {onPlayPause && (
        <button
          onClick={onPlayPause}
          // Distinct from the player bar's own "Play"/"Pause" buttons —
          // once both are on screen at once (this episode is loaded and
          // playing), an identical accessible name on two different
          // buttons is a real ambiguity for screen readers and any
          // role-based query, not just a testing nuisance.
          aria-label={isCurrentPlayerEpisode && playing ? 'Pause episode' : 'Play episode'}
          className="mt-4 flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
        >
          {isCurrentPlayerEpisode && playing ? (
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
