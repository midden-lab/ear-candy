import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MobileHeaderProps {
  podcastName: string
  onAdminClick: () => void
  themeBadge?: ReactNode
}

export default function MobileHeader({ podcastName, onAdminClick, themeBadge }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
      <h1 className="truncate text-sm font-semibold text-zinc-100">{podcastName}</h1>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="More options"
          aria-expanded={menuOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-40 mt-2 w-48 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl">
            <button
              onClick={() => { setMenuOpen(false); onAdminClick() }}
              className="flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Admin
            </button>
            {themeBadge && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-zinc-300">Theme</span>
                {themeBadge}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
