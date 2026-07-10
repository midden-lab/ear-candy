import React from 'react'

interface AppShellProps {
  rail: React.ReactNode
  sidebar: React.ReactNode
  detail: React.ReactNode
  themeBadge?: React.ReactNode
}

export default function AppShell({ rail, sidebar, detail, themeBadge }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <aside className="flex flex-shrink-0">
        {rail}
        <div className="w-64 overflow-y-auto border-r border-zinc-800">
          {sidebar}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {detail}
      </main>
      {themeBadge && (
        <div className="fixed bottom-4 right-4 z-50">
          {themeBadge}
        </div>
      )}
    </div>
  )
}
