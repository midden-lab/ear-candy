import { useEffect, useRef, useState } from 'react'
import type { Season } from '../types'

interface SeasonChipProps {
  seasons: Season[]
  activeSeason: number | null
  onSelect: (seasonId: number) => void
}

/**
 * Mobile-only compact season switcher: a single chip showing the active
 * season, opening a small listbox on tap — replaces the horizontal
 * SeasonTabs pill row on small screens to reclaim vertical list space.
 * Desktop keeps SeasonTabs unchanged.
 */
export default function SeasonChip({ seasons, activeSeason, onSelect }: SeasonChipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const active = seasons.find(s => s.id === activeSeason)

  if (seasons.length === 0) return null

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 active:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active?.title ?? 'Season'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Select season"
          className="absolute left-0 top-full z-40 mt-2 min-w-[10rem] rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          {seasons.map(season => (
            <li key={season.id} role="presentation">
              <button
                role="option"
                aria-selected={season.id === activeSeason}
                onClick={() => { onSelect(season.id); setOpen(false) }}
                className={`flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm ${
                  season.id === activeSeason
                    ? 'bg-[color:var(--accent)]/15 font-semibold text-[var(--accent)]'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {season.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
