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

const FOCUSABLE_SELECTOR = 'button, a[href], input, [tabindex]:not([tabindex="-1"])'

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
  const popoverRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function closePopover() {
    setOpen(false)
    triggerRef.current?.focus()
  }

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

  // Move focus into the popover on open, trap Tab/Shift+Tab within it, and
  // close on Escape — same hand-rolled shape as ShareDialog's real modal
  // focus trap, scoped here to a corner popover rather than a centered
  // dialog. Without this, Tab from the trigger leaked straight into the
  // episode list behind the (still visually open) popover.
  useEffect(() => {
    if (!open) return
    const popover = popoverRef.current
    const firstOption = popover?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    firstOption?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closePopover()
        return
      }
      if (e.key !== 'Tab' || !popover) return
      const focusable = Array.from(popover.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (seasons.length === 0) return null

  const active = seasons.find(s => s.id === activeSeason)

  return (
    <div ref={containerRef} className="season-select">
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        className="season-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{active?.title ?? 'Season'}</span>
        {/* .caret's rotation is driven entirely by CSS off aria-expanded
            (.season-trigger[aria-expanded="true"] .caret), no conditional
            class needed. */}
        <svg className="caret" width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
          <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul ref={popoverRef} role="listbox" aria-label="Select season" className="season-popover">
          {seasons.map(season => {
            const isSelected = season.id === activeSeason
            return (
              <li key={season.id} role="presentation">
                <button
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onSelect(season.id); closePopover() }}
                  className="season-option"
                >
                  <span>{season.title}</span>
                  <span className="opt-count mono">{episodeCounts[season.id] ?? 0}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
