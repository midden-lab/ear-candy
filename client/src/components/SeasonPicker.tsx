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
const FOCUSABLE_SELECTOR = 'button, a[href], input, [tabindex]:not([tabindex="-1"])'

export default function SeasonPicker({ seasons, activeSeason, episodeCounts = {}, onSelect }: SeasonPickerProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Focus the close button on open, trap Tab/Shift+Tab within the panel,
  // and close on Escape — same shape as ShareDialog's real modal focus
  // trap. Without the trap, Tab from the close button leaked straight into
  // the (visually hidden, but still in the DOM) page behind this overlay.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
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
      {/* Same .season-trigger/.caret classes as SeasonTabs' desktop trigger
          — the mockup shares this exact markup across both shells. */}
      <button ref={triggerRef} onClick={() => setOpen(true)} className="season-trigger" aria-haspopup="dialog">
        <span>{active?.title ?? 'Season'}</span>
        <svg className="caret" width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
          <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a season"
          className="m-season-picker"
          // .m-season-picker's own padding (26px/22px/34px) is duplicated
          // into the calc() below rather than overridden by it — a plain
          // inline paddingTop/Bottom would otherwise replace the class's
          // values outright instead of adding safe-area clearance on top.
          style={{
            paddingTop: 'calc(26px + env(safe-area-inset-top, 0px))',
            paddingBottom: 'calc(34px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button ref={closeButtonRef} onClick={closeAndRestoreFocus} aria-label="Close" className="m-season-picker-close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform="rotate(45 8 8)" />
            </svg>
          </button>
          <h3 className="m-season-picker-title">Seasons</h3>

          <ul role="listbox" aria-label="Select season" className="m-season-picker-list">
            {seasons.map(season => {
              const isSelected = season.id === activeSeason
              return (
                <li key={season.id} role="presentation">
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onSelect(season.id); closeAndRestoreFocus() }}
                    className="season-option"
                  >
                    <span>{season.title}</span>
                    <span className="opt-count mono">{episodeCounts[season.id] ?? 0}</span>
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
