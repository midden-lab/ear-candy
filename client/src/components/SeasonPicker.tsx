import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Season } from '../types'

interface SeasonPickerProps {
  seasons: Season[]
  activeSeason: number | null
  /** Episode count per season id, keyed by `season.id`. Omitted counts
   *  render as 0. */
  episodeCounts?: Record<number, number>
  onSelect: (seasonId: number) => void
}

/**
 * Mobile season selector: a compact trigger opening a full-screen overlay,
 * not an anchored dropdown — a dropdown/popover is a desktop-native
 * modality that fights viewport space and touch-target sizing on a phone,
 * and gives no sense of how many seasons exist. Portaled to document.body
 * (same pattern as ShareDialog) so it's never clipped by whatever
 * scrollable container the trigger itself lives inside.
 */
export default function SeasonPicker({ seasons, activeSeason, episodeCounts = {}, onSelect }: SeasonPickerProps) {
  const [open, setOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Lock background scroll while the overlay is open — same reasoning as
  // ShareDialog's modal: this is a full takeover, not a small popover.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [open])

  function closeAndRestoreFocus() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  if (seasons.length === 0) return null

  const active = seasons.find(s => s.id === activeSeason)

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 active:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800"
        aria-haspopup="dialog"
      >
        {active?.title ?? 'Season'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a season"
          className="fixed inset-0 z-[60] flex flex-col bg-canvas"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center px-2 py-2">
            <button
              ref={closeButtonRef}
              onClick={closeAndRestoreFocus}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <h2 className="ml-1 text-sm font-semibold text-ink">Seasons</h2>
          </div>

          <ul role="listbox" aria-label="Select season" className="flex-1 overflow-y-auto px-2 pb-4">
            {seasons.map(season => {
              const isSelected = season.id === activeSeason
              return (
                <li key={season.id} role="presentation">
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onSelect(season.id); closeAndRestoreFocus() }}
                    className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-base ${
                      isSelected ? 'font-semibold text-[var(--accent)]' : 'text-ink-2'
                    }`}
                  >
                    <span className="truncate">{season.title}</span>
                    <span className={`shrink-0 text-sm ${isSelected ? 'text-[var(--accent)]' : 'text-ink-3'}`}>
                      {episodeCounts[season.id] ?? 0}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body
      )}
    </>
  )
}
