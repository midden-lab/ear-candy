import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildShareUrl, buildBlueskyIntentUrl } from '../utils/shareUrl'
// Facebook/X are temporarily disabled below pending user research — see
// the commented-out share-icon block further down. Re-import these when
// re-enabling: buildTweetIntentUrl, buildFacebookIntentUrl
import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

export interface ShareDialogProps {
  episodeId: number
  episodeTitle: string
  /** Current playback position — pass only when this episode is the one
   *  actively loaded in the player. Omit entirely for a beginning-only
   *  share, which then renders with no timestamp option at all. */
  currentTime?: number
  className?: string
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
export default function ShareDialog({ episodeId, episodeTitle, currentTime, className }: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)

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

  // Focus the panel on open, trap Tab/Shift+Tab within it, and close on
  // Escape — the same hand-rolled listener shape this app already uses
  // elsewhere for outside-click/Escape dismissal, just scoped to a real
  // focus trap since this is a true modal, not a corner popover.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    panel?.focus()

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

  const iconBtnClass = 'rounded p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'
  const socialBtnClass = 'flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'

  return (
    <div className={`inline-block ${className ?? ''}`}>
      <button
        ref={triggerRef}
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={offersTimestamp ? 'Share this moment' : 'Share episode'}
        className={iconBtnClass}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
          <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
        </svg>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm md:p-4"
          onClick={closeDialog}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            className={
              isDesktop
                ? 'w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900'
                : 'fixed bottom-0 left-0 right-0 w-full rounded-t-2xl border-t border-zinc-200 bg-white p-4 shadow-xl transition-transform duration-300 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-900'
            }
            style={!isDesktop ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
          >
            {!isDesktop && (
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
            )}

            <div className="mb-4 flex items-center justify-between">
              <h2 id="share-dialog-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Share episode
              </h2>
              <button
                onClick={closeDialog}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <label htmlFor="share-dialog-url" className="sr-only">Shareable link</label>
            <div
              id="share-dialog-url"
              className="mb-3 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300"
            >
              {shareUrl}
            </div>

            <button
              onClick={() => void handleCopy()}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5" />
                <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5" />
              </svg>
              <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {offersTimestamp && (
              <label className="mb-4 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={e => setIncludeTimestamp(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Start at {formatTimestamp(currentTime!)}
              </label>
            )}

            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Share to</p>
            <div className="flex gap-3">
              <a
                href={buildBlueskyIntentUrl(shareUrl, episodeTitle)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSocialClick}
                aria-label="Share to Bluesky"
                className={socialBtnClass}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 8.5C10.6 5.7 8.2 3.6 6 3c-2 0-3 1.1-3 2.9 0 3.9 2 8.1 4.5 9.6-2 .3-3.5 1.7-2.4 3.5 1 1.7 4 1.5 6.3-1.5.4-.5.7-1 .9-1.5.2.5.5 1 .9 1.5 2.3 3 5.3 3.2 6.3 1.5 1.1-1.8-.4-3.2-2.4-3.5C19 14 21 9.8 21 5.9 21 4.1 20 3 18 3c-2.2.6-4.6 2.7-6 5.5Z" />
                </svg>
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
                aria-label="Share to Facebook"
                className={socialBtnClass}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" />
                </svg>
              </a>
              <a
                href={buildTweetIntentUrl(shareUrl, episodeTitle)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSocialClick}
                aria-label="Share to X"
                className={socialBtnClass}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.9 2H22l-7.6 8.7L23.3 22h-6.9l-5.4-7-6.2 7H1.7l8.1-9.3L1 2h7l4.9 6.4L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
                </svg>
              </a>
              */}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
