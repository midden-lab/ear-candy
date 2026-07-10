import React from 'react'

interface AdminLayoutProps {
  onLogout: () => void
  children: React.ReactNode
}

export default function AdminLayout({ onLogout, children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Ear Candy Admin</h1>
        <button
          onClick={onLogout}
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          Sign out
        </button>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
