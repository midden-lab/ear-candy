import { useEffect, useRef, useState } from 'react'
import { buildShareUrl, buildTweetIntentUrl, buildFacebookIntentUrl } from '../utils/shareUrl'

export interface ShareMenuProps {
  episodeId: number
  episodeTitle: string
  /** Current playback position — pass only when this episode is the one
   *  actively loaded in the player. Omit entirely for a beginning-only
   *  share (e.g. from the episode detail pane), which then renders with no
   *  timestamp option at all. */
  currentTime?: number
  /** Icon-only trigger for the player bars vs. icon+label for the detail pane. */
  variant?: 'icon' | 'labeled'
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

export default function ShareMenu({ episodeId, episodeTitle, currentTime, variant = 'icon', className }: ShareMenuProps) {
  const [open, setOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const offersTimestamp = (currentTime ?? 0) >= MIN_TIMESTAMP_SECONDS
  const shareTime = offersTimestamp && includeTimestamp ? currentTime : undefined
  const shareUrl = buildShareUrl(episodeId, shareTime)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggleOpen() {
    setOpen(o => {
      const next = !o
      if (next) {
        setCopied(false)
        setIncludeTimestamp(true)
      }
      return next
    })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const iconBtnClass = 'rounded p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'
  const labeledBtnClass = 'flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors'

  return (
    <div ref={containerRef} className={`relative inline-block ${className ?? ''}`}>
      <button
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={offersTimestamp ? 'Share this moment' : 'Share episode'}
        className={variant === 'labeled' ? labeledBtnClass : iconBtnClass}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
          <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
        </svg>
        {variant === 'labeled' && 'Share'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {offersTimestamp && (
            <p className="px-2 py-1.5 text-xs text-zinc-400 dark:text-zinc-500">
              {includeTimestamp ? `Includes timestamp ${formatTimestamp(currentTime!)}` : 'From the beginning'}
            </p>
          )}
          <button
            role="menuitem"
            onClick={() => void handleCopy()}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">🔗</span>
            <span aria-live="polite">{copied ? 'Copied!' : 'Copy link'}</span>
          </button>
          <a
            role="menuitem"
            href={buildTweetIntentUrl(shareUrl, episodeTitle)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">🐦</span> Share to X
          </a>
          <a
            role="menuitem"
            href={buildFacebookIntentUrl(shareUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">📘</span> Share to Facebook
          </a>
          {offersTimestamp && (
            <label className="mt-1 flex items-center gap-2 border-t border-zinc-100 px-2 py-1.5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={!includeTimestamp}
                onChange={e => setIncludeTimestamp(!e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Share from the beginning
            </label>
          )}
        </div>
      )}
    </div>
  )
}
