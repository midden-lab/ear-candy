import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildShareUrl, buildBlueskyIntentUrl } from '../utils/shareUrl'
// Facebook/X are temporarily disabled below pending user research — see
// the commented-out share-icon block further down. Re-import these when
// re-enabling: buildTweetIntentUrl, buildFacebookIntentUrl

export interface ShareDialogProps {
  episodeId: number
  episodeTitle: string
  /** Current playback position — pass only when this episode is the one
   *  actively loaded in the player. Omit entirely for a beginning-only
   *  share, which then renders with no timestamp option at all. */
  currentTime?: number
}

// Matches the "not worth remembering" threshold already used for saved
// playback position (utils/episodeProgress.ts) — a few seconds in isn't a
// meaningful moment to offer sharing from.
const MIN_TIMESTAMP_SECONDS = 5

function formatTimestamp(seconds: number): string {
  const abs = Math.floor(seconds)
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const FOCUSABLE_SELECTOR = 'button, a[href], input, [tabindex]:not([tabindex="-1"])'

/**
 * Share trigger + dialog, YouTube-style: a centered modal on desktop, a
 * bottom sheet on mobile, portaled straight to document.body. Portaling is
 * load-bearing, not cosmetic — the previous implementation rendered an
 * absolutely-positioned dropdown relative to a trigger button living
 * inside the fixed bottom player bar, so the dropdown opened downward off
 * the bottom of the viewport. A portal + fixed/centered layout can never
 * repeat that failure mode regardless of where the trigger sits.
 */
export default function ShareDialog({ episodeId, episodeTitle, currentTime }: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  const offersTimestamp = (currentTime ?? 0) >= MIN_TIMESTAMP_SECONDS
  const shareTime = offersTimestamp && includeTimestamp ? currentTime : undefined
  const shareUrl = buildShareUrl(episodeId, shareTime)

  function openDialog() {
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    setCopied(false)
    setIncludeTimestamp(true)
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
    lastFocusedRef.current?.focus()
  }

  // Focus the close button on open (the WAI-ARIA APG dialog convention —
  // a specific interactive control, not the panel container itself), trap
  // Tab/Shift+Tab within the panel, and close on Escape — the same
  // hand-rolled listener shape this app already uses elsewhere for
  // outside-click/Escape dismissal, just scoped to a real focus trap since
  // this is a true modal, not a corner popover.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeDialog()
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

  // Lock background scroll while the dialog is open — unlike the corner
  // popover this replaces, a centered modal leaves backdrop visible, so an
  // unlocked background scrolling underneath would look broken.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [open])

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSocialClick() {
    closeDialog()
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={offersTimestamp ? 'Share this moment' : 'Share episode'}
        className="share-btn"
      >
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path d="M7.5 1v8.2M4.3 4.2 7.5 1l3.2 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 8.5v3.8c0 .66.54 1.2 1.2 1.2h8.6c.66 0 1.2-.54 1.2-1.2V8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Share
      </button>

      {open && createPortal(
        <div className="share-backdrop" onClick={closeDialog}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            className="share-panel"
          >
            <p id="share-dialog-title" className="share-title">Share this episode</p>
            <p className="share-sub">{episodeTitle}</p>

            <div className="share-url-row">
              <span className="share-url mono">{shareUrl}</span>
              <button onClick={() => void handleCopy()} aria-label="Copy link" className="share-copy">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {/* Separate from the button's own (stable) aria-label — an
                aria-live region whose text lives on the very element that
                was just clicked/focused is a known spotty case for
                screen-reader + browser combos not reliably announcing. */}
            <span role="status" aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>

            {offersTimestamp && (
              <label className="mb-4 flex items-center gap-2 text-sm tracking-tight text-ink-2">
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={e => setIncludeTimestamp(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Start at {formatTimestamp(currentTime!)}
              </label>
            )}

            <div className="share-dests">
              {/* Plain text, no icon — matches the mockup's .share-dests
                  buttons exactly (bare text, no circular fill). */}
              <a
                href={buildBlueskyIntentUrl(shareUrl, episodeTitle)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSocialClick}
              >
                Bluesky
              </a>
              {/*
                Facebook and X are temporarily hidden/disabled pending user
                research on which platforms our audience actually wants —
                keep the working implementation in place (including their
                tests) so re-enabling is just uncommenting this block.
              <a
                href={buildFacebookIntentUrl(shareUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSocialClick}
              >
                Facebook
              </a>
              <a
                href={buildTweetIntentUrl(shareUrl, episodeTitle)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSocialClick}
              >
                Twitter / X
              </a>
              */}
            </div>

            <button ref={closeButtonRef} onClick={closeDialog} className="share-close">Close</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
