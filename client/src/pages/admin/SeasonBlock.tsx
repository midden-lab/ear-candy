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

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
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
  function handleDeleteSeason() {
    if (window.confirm(`Delete Season ${season.number}: ${season.title}? This also deletes all of its episodes.`)) {
      onDeleteSeason(season.id)
    }
  }

  function handleDeleteEpisode(ep: Episode) {
    if (window.confirm(`Delete "${ep.title}"? This cannot be undone.`)) {
      onDeleteEpisode(ep.id)
    }
  }

  return (
    <div data-testid="season-card" className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900">
        <span className="font-semibold">S{season.number}: {season.title}</span>
        <div className="flex gap-1">
          <button
            onClick={() => onEditSeason(season)}
            aria-label={`Edit Season ${season.number}: ${season.title}`}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <PencilIcon />
            Edit
          </button>
          <button
            onClick={handleDeleteSeason}
            aria-label={`Delete Season ${season.number}: ${season.title}`}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-950 hover:text-red-300"
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      </div>
      <div className="divide-y divide-zinc-800">
        {episodes.map(ep => (
          <div key={ep.id} className="flex items-center justify-between px-4 py-2 bg-zinc-950 hover:bg-zinc-900">
            <span className="text-sm">{ep.number}. {ep.title}</span>
            <div className="flex gap-1">
              <button
                onClick={() => onEditEpisode(ep)}
                aria-label={`Edit Episode ${ep.number}: ${ep.title}`}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <PencilIcon />
                Edit
              </button>
              <button
                onClick={() => handleDeleteEpisode(ep)}
                aria-label={`Delete Episode ${ep.number}: ${ep.title}`}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-950 hover:text-red-300"
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          </div>
        ))}
        <div className="p-3 bg-zinc-950">
          <button
            onClick={() => onNewEpisode(season.id)}
            aria-label={`Add episode to Season ${season.number}: ${season.title}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 py-2.5 text-sm font-medium text-[var(--accent)] hover:border-[var(--accent)] hover:bg-zinc-900 transition-colors"
          >
            <PlusIcon />
            New Episode
          </button>
        </div>
      </div>
    </div>
  )
}
