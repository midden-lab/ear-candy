import type { Season } from '../types'

interface SeasonTabsProps {
  seasons: Season[]
  activeSeason: number | null
  onSelect: (seasonId: number) => void
}

export default function SeasonTabs({ seasons, activeSeason, onSelect }: SeasonTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto px-2 py-2 border-b border-zinc-800">
      {seasons.map(season => (
        <button
          key={season.id}
          onClick={() => onSelect(season.id)}
          className={`flex min-h-11 items-center whitespace-nowrap rounded px-3 py-1 text-sm transition-colors md:min-h-0 ${
            activeSeason === season.id
              ? 'bg-[var(--accent)] text-white'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
          aria-selected={activeSeason === season.id}
        >
          {season.title}
        </button>
      ))}
    </div>
  )
}
