import { useEffect, useRef, useState } from 'react'
import type { Season } from '../types'

interface SeasonTabsProps {
  seasons: Season[]
  activeSeason: number | null
  /** Episode count per season id, keyed by `season.id` — shown alongside
   *  each option so a growing catalog stays orientable ("how many seasons
   *  exist, how big is each one") without needing to open every season to
   *  find out. Omitted counts render as 0. */
  episodeCounts?: Record<number, number>
  onSelect: (seasonId: number) => void
}

/**
 * Desktop season selector: a fixed-width trigger opening a listbox popover,
 * rather than a flat horizontally-scrolling row of buttons — a flat row
 * works at a handful of seasons and breaks down well before a dozen (no
 * indication of how many exist, awkward wrapping/scrolling). The trigger's
 * fixed width means the season list can grow indefinitely without
 * disturbing the surrounding layout.
 */
export default function SeasonTabs({ seasons, activeSeason, episodeCounts = {}, onSelect }: SeasonTabsProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (seasons.length === 0) return null

  const active = seasons.find(s => s.id === activeSeason)

  return (
    <div ref={containerRef} className="relative px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex min-h-11 w-56 items-center justify-between gap-2 rounded-md border border-zinc-200 bg-surface px-3 py-1.5 text-sm font-medium text-ink dark:border-zinc-800"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{active?.title ?? 'Season'}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Select season"
          className="absolute left-0 top-full z-40 mt-2 max-h-80 w-56 overflow-y-auto rounded-lg bg-surface p-1 shadow-xl"
        >
          {seasons.map(season => {
            const isSelected = season.id === activeSeason
            return (
              <li key={season.id} role="presentation">
                <button
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onSelect(season.id); setOpen(false) }}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm ${
                    isSelected ? 'font-semibold text-[var(--accent)]' : 'text-ink-2 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate">{season.title}</span>
                  <span className={`shrink-0 text-xs ${isSelected ? 'text-[var(--accent)]' : 'text-ink-3'}`}>
                    {episodeCounts[season.id] ?? 0}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
