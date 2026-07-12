import React, { useEffect, useState } from 'react'

interface AdminLayoutProps {
  onLogout: () => void
  onUnauthorized: () => void
  children: React.ReactNode
}

export default function AdminLayout({ onLogout, onUnauthorized, children }: AdminLayoutProps) {
  // Defense in depth: the real access boundary is the server-side
  // requireAdmin check on every admin API call, but this catches a forced
  // or incorrect client-side `view` state before it renders a broken shell
  // whose data fetches would just 401 (see issue #14 / EC-008).
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'include' })
      .then(res => setAuthorized(res.ok))
      .catch(() => setAuthorized(false))
  }, [])

  useEffect(() => {
    if (authorized === false) onUnauthorized()
  }, [authorized, onUnauthorized])

  if (authorized !== true) return null

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Ear Candy Admin</h1>
        <button
          onClick={onLogout}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
        >
          Sign out
        </button>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
