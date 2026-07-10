import type { Episode, Season } from '../types'
import PillBadge from './PillBadge'

interface DetailPaneProps {
  episode: Episode | null
  seasons: Season[]
}

export default function DetailPane({ episode, seasons }: DetailPaneProps) {
  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
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
    <div className="p-8 pb-48">
      {episode.cover_art_path && (
        <img
          src={episode.cover_art_path}
          alt={episode.title}
          className="mb-6 w-48 rounded-xl shadow-lg"
        />
      )}
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">{seasonLabel}</p>
      <h1 className="text-2xl font-bold text-zinc-100">{episode.title}</h1>
      <p className="mt-1 text-sm text-zinc-400">{episode.publish_date}</p>

      {guestList.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {guestList.map(guest => (
            <PillBadge key={guest} label={guest} className="bg-blue-900 text-blue-200" />
          ))}
        </div>
      )}

      {tagList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {tagList.map(tag => (
            <PillBadge key={tag} label={tag} className="bg-purple-900 text-purple-200" />
          ))}
        </div>
      )}

      {episode.description && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">About this episode</p>
          <p className="leading-relaxed text-zinc-300">{episode.description}</p>
        </div>
      )}
    </div>
  )
}
