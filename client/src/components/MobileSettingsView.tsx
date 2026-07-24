import type { ReactNode } from 'react'

interface MobileSettingsViewProps {
  onAdminClick: () => void
  themeBadge: ReactNode
}

/**
 * Mobile Settings screen, reached via MobileTabBar's Settings tab —
 * replaces the old hidden "⋮" kebab menu's Admin + theme items with an
 * always-reachable, labeled screen.
 */
export default function MobileSettingsView({ onAdminClick, themeBadge }: MobileSettingsViewProps) {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
      <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Appearance</span>
          {themeBadge}
        </div>
        <button
          onClick={onAdminClick}
          className="flex w-full min-h-11 items-center justify-between px-4 py-3.5 text-left active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Admin dashboard</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 dark:text-zinc-600" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
