import type { Season } from '../types'

interface SeasonTabsProps {
  seasons: Season[]
  activeSeason: number | null
  onSelect: (seasonId: number) => void
}

export default function SeasonTabs({ seasons, activeSeason, onSelect }: SeasonTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto px-2 py-2 border-b border-zinc-200 dark:border-zinc-800">
      {seasons.map(season => (
        <button
          key={season.id}
          onClick={() => onSelect(season.id)}
          className={`flex min-h-11 items-center whitespace-nowrap rounded px-3 py-1 text-sm transition-colors md:min-h-0 ${
            activeSeason === season.id
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
          aria-selected={activeSeason === season.id}
        >
          {season.title}
        </button>
      ))}
    </div>
  )
}
