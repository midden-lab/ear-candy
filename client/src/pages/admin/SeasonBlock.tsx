import type { Season, Episode } from '../../types'

interface SeasonBlockProps {
  season: Season
  episodes: Episode[]
  onEditSeason: (season: Season) => void
  onDeleteSeason: (id: number) => void
  onNewEpisode: (seasonId: number) => void
  onEditEpisode: (episode: Episode) => void
  onDeleteEpisode: (id: number) => void
}

export default function SeasonBlock({
  season,
  episodes,
  onEditSeason,
  onDeleteSeason,
  onNewEpisode,
  onEditEpisode,
  onDeleteEpisode,
}: SeasonBlockProps) {
  return (
    <div data-testid="season-card" className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900">
        <span className="font-semibold">S{season.number}: {season.title}</span>
        <div className="flex gap-2">
          <button onClick={() => onEditSeason(season)} className="text-xs text-zinc-400 hover:text-zinc-100">Edit</button>
          <button onClick={() => onDeleteSeason(season.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
        </div>
      </div>
      <div className="divide-y divide-zinc-800">
        {episodes.map(ep => (
          <div key={ep.id} className="flex items-center justify-between px-4 py-2 bg-zinc-950 hover:bg-zinc-900">
            <span className="text-sm">{ep.number}. {ep.title}</span>
            <div className="flex gap-2">
              <button onClick={() => onEditEpisode(ep)} className="text-xs text-zinc-400 hover:text-zinc-100">Edit</button>
              <button onClick={() => onDeleteEpisode(ep.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </div>
        ))}
        <div className="px-4 py-2 bg-zinc-950">
          <button onClick={() => onNewEpisode(season.id)} className="text-xs text-[var(--accent)] hover:opacity-80">
            + New Episode
          </button>
        </div>
      </div>
    </div>
  )
}

