# UX Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close seven confirmed gaps between the approved UX spec and the current implementation, restoring the intended listener experience and production architecture.

**Architecture:** All listener UI fixes are pure client-side changes in `client/src/`. The production architecture fix rewrites the root `Dockerfile` and `docker-compose.prod.yml` so a single image serves both the React SPA and the API on port 3000. No data model or API route changes are required.

**Tech Stack:** React 19, Zustand 4, Tailwind 3, Vitest + @testing-library/react, Fastify 4, @fastify/static, Docker multi-stage builds

---

## File Map

### Modified (client)
- `client/src/components/ThemeBadge.tsx` — rebuild as ☀/🌙 toggle, read/write `localStorage`
- `client/src/hooks/useTheme.ts` — add dark-mode class toggle on `<html>` from `localStorage`
- `client/src/components/AppShell.tsx` — add `themeBadge` slot rendered as fixed bottom-right overlay
- `client/src/components/IconRail.tsx` — add Episodes, Seasons, Search nav icons above spacer
- `client/src/components/EpisodeList.tsx` — accept `podcastName` prop, render at top
- `client/src/components/EpisodeItem.tsx` — fix active state (left border + tint), add ep number, duration, guests, EQ indicator
- `client/src/components/DetailPane.tsx` — guests as blue pills, tags as purple pills, "About this episode" label, season/episode label; accept `seasons` prop
- `client/src/components/AudioPlayer.tsx` — add skip-to-start, −15s, +15s, skip-to-end, speed toggle, timestamp display
- `client/src/store/playerStore.ts` — add `speed: number` and `setSpeed` action
- `client/src/App.tsx` — pass `podcastName` to EpisodeList, pass `seasons` to DetailPane, pass ThemeBadge to AppShell

### Modified (tests)
- `client/src/tests/ThemeBadge.test.tsx` — replace color-swatch tests with toggle tests
- `client/src/tests/useTheme.test.ts` — add dark-mode class tests
- `client/src/tests/AppShell.test.tsx` — add `themeBadge` prop test
- `client/src/tests/IconRail.test.tsx` — add nav icon tests
- `client/src/tests/EpisodeList.test.tsx` — add podcast name rendering test
- `client/src/tests/EpisodeItem.test.tsx` — fix active-state test, add ep number/duration/guests tests
- `client/src/tests/DetailPane.test.tsx` — add blue/purple pill tests, label tests
- `client/src/tests/AudioPlayer.test.tsx` — add skip/speed button tests
- `client/src/tests/playerStore.test.ts` — add speed state tests

### Modified (server + production)
- `server/src/app.ts` — add static file serving for client dist when `SERVE_CLIENT=true`
- `Dockerfile` (root, new) — 3-stage: client-builder → server-builder → runner
- `docker-compose.prod.yml` — replace 2-service file with 1-service using root Dockerfile

---

## Task 1: ThemeBadge + useTheme — dark/light mode toggle

**Files:**
- Modify: `client/src/components/ThemeBadge.tsx`
- Modify: `client/src/hooks/useTheme.ts`
- Modify: `client/src/tests/ThemeBadge.test.tsx`
- Modify: `client/src/tests/useTheme.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `client/src/tests/ThemeBadge.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach } from 'vitest'
import ThemeBadge from '../components/ThemeBadge'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

it('renders a toggle button with accessible label', () => {
  render(<ThemeBadge />)
  expect(screen.getByRole('button', { name: /toggle dark mode|toggle light mode/i })).toBeInTheDocument()
})

it('shows sun icon (light mode) when dark class is absent', () => {
  document.documentElement.classList.remove('dark')
  render(<ThemeBadge />)
  expect(screen.getByText('☀️')).toBeInTheDocument()
})

it('shows moon icon (dark mode) when dark class is present', () => {
  document.documentElement.classList.add('dark')
  render(<ThemeBadge />)
  expect(screen.getByText('🌙')).toBeInTheDocument()
})

it('toggles dark class on html element when clicked', async () => {
  const user = userEvent.setup()
  document.documentElement.classList.remove('dark')
  render(<ThemeBadge />)
  await user.click(screen.getByRole('button'))
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})

it('persists preference to localStorage', async () => {
  const user = userEvent.setup()
  document.documentElement.classList.remove('dark')
  render(<ThemeBadge />)
  await user.click(screen.getByRole('button'))
  expect(localStorage.getItem('theme')).toBe('dark')
})
```

Replace `client/src/tests/useTheme.test.ts` with:

```ts
import { renderHook } from '@testing-library/react'
import { useTheme } from '../hooks/useTheme'

describe('useTheme', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })

  it('sets --accent CSS custom property on mount', () => {
    renderHook(() => useTheme('#ff6600'))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff6600')
  })

  it('updates --accent when accentColor changes', () => {
    const { rerender } = renderHook(({ color }) => useTheme(color), {
      initialProps: { color: '#ff6600' },
    })
    rerender({ color: '#0099ff' })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0099ff')
  })

  it('reads dark mode preference from localStorage on mount', () => {
    localStorage.setItem('theme', 'dark')
    renderHook(() => useTheme('#ff6600'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('adds dark class when localStorage says dark', () => {
    localStorage.setItem('theme', 'dark')
    renderHook(() => useTheme('#5a3ef5'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not add dark class when localStorage is empty', () => {
    localStorage.removeItem('theme')
    renderHook(() => useTheme('#5a3ef5'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd client && npx vitest run src/tests/ThemeBadge.test.tsx src/tests/useTheme.test.ts
```

Expected: failures for missing toggle behavior and dark class logic.

- [ ] **Step 3: Rewrite `client/src/hooks/useTheme.ts`**

```ts
import { useEffect } from 'react'

export function useTheme(accentColor: string): void {
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor)
  }, [accentColor])

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') {
      document.documentElement.classList.add('dark')
    }
  }, [])
}
```

- [ ] **Step 4: Rewrite `client/src/components/ThemeBadge.tsx`**

```tsx
import { useState, useEffect } from 'react'

export default function ThemeBadge() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  return (
    <button
      onClick={() => setDark(d => !d)}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm shadow-lg ring-1 ring-zinc-700 hover:bg-zinc-700 transition-colors"
      aria-label={dark ? 'Toggle light mode' : 'Toggle dark mode'}
    >
      {dark ? '🌙' : '☀️'}
    </button>
  )
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd client && npx vitest run src/tests/ThemeBadge.test.tsx src/tests/useTheme.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ThemeBadge.tsx client/src/hooks/useTheme.ts client/src/tests/ThemeBadge.test.tsx client/src/tests/useTheme.test.ts
git commit -m "fix: ThemeBadge is now a dark/light toggle persisted to localStorage"
```

---

## Task 2: AppShell — add `themeBadge` slot as fixed overlay

**Files:**
- Modify: `client/src/components/AppShell.tsx`
- Modify: `client/src/tests/AppShell.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing test**

Add to `client/src/tests/AppShell.test.tsx`:

```tsx
it('renders themeBadge content in a fixed bottom-right overlay', () => {
  render(
    <AppShell
      rail={<div>Rail</div>}
      sidebar={<div>Sidebar</div>}
      detail={<div>Detail</div>}
      themeBadge={<div>ThemeBadge</div>}
    />
  )
  expect(screen.getByText('ThemeBadge')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/tests/AppShell.test.tsx
```

Expected: TypeScript error / test failure — `themeBadge` prop not accepted.

- [ ] **Step 3: Update `client/src/components/AppShell.tsx`**

```tsx
import React from 'react'

interface AppShellProps {
  rail: React.ReactNode
  sidebar: React.ReactNode
  detail: React.ReactNode
  themeBadge?: React.ReactNode
}

export default function AppShell({ rail, sidebar, detail, themeBadge }: AppShellProps) {
  return (
    <div className="relative flex h-screen overflow-hidden bg-zinc-950">
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
```

- [ ] **Step 4: Update `client/src/App.tsx`** — pass `<ThemeBadge />` to AppShell

In `App.tsx`, add the import and pass the prop:

```tsx
import ThemeBadge from './components/ThemeBadge'
// ... inside the return for view === 'player':
return (
  <AppShell
    rail={<IconRail onAdminClick={() => setView('admin-login')} />}
    sidebar={
      <EpisodeList
        seasons={seasons}
        episodes={episodes}
        activeSeason={activeSeason}
        onSeasonSelect={handleSeasonSelect}
      />
    }
    detail={
      <>
        <DetailPane episode={episode} seasons={seasons} />
        <AudioPlayer />
      </>
    }
    themeBadge={<ThemeBadge />}
  />
)
```

(The `seasons` prop on `DetailPane` is wired here in advance; it becomes required in Task 5.)

- [ ] **Step 5: Run all AppShell tests**

```bash
cd client && npx vitest run src/tests/AppShell.test.tsx
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AppShell.tsx client/src/tests/AppShell.test.tsx client/src/App.tsx
git commit -m "fix: AppShell renders ThemeBadge as fixed bottom-right overlay"
```

---

## Task 3: IconRail — add Episodes, Seasons, Search nav icons

**Files:**
- Modify: `client/src/components/IconRail.tsx`
- Modify: `client/src/tests/IconRail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `client/src/tests/IconRail.test.tsx`:

```tsx
it('renders an "Episodes" nav icon', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Episodes' })).toBeInTheDocument()
})

it('renders a "Seasons" nav icon', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Seasons' })).toBeInTheDocument()
})

it('renders a "Search" nav icon', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd client && npx vitest run src/tests/IconRail.test.tsx
```

Expected: failures for missing Episodes/Seasons/Search buttons.

- [ ] **Step 3: Rewrite `client/src/components/IconRail.tsx`**

```tsx
interface IconRailProps {
  onAdminClick: () => void
}

export default function IconRail({ onAdminClick }: IconRailProps) {
  return (
    <nav className="flex w-16 flex-col items-center gap-2 border-r border-zinc-800 py-4">
      {/* Logo */}
      <div className="mb-2 text-[var(--accent)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H5.07A7 7 0 0 1 19 12h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1a3 3 0 0 0 3-3v-4a9 9 0 0 0-9-9Z"/>
        </svg>
      </div>

      {/* Episodes */}
      <button
        className="rounded-lg p-2 text-[var(--accent)] bg-zinc-800 transition-colors"
        aria-label="Episodes"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      </button>

      {/* Seasons */}
      <button
        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        aria-label="Seasons"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
      </button>

      {/* Search */}
      <button
        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        aria-label="Search"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </button>

      <div className="flex-1" />

      {/* Admin/settings */}
      <button
        onClick={onAdminClick}
        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        aria-label="Admin settings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
        </svg>
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: Run all IconRail tests**

```bash
cd client && npx vitest run src/tests/IconRail.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/IconRail.tsx client/src/tests/IconRail.test.tsx
git commit -m "fix: add Episodes, Seasons, Search nav icons to IconRail"
```

---

## Task 4: EpisodeList — podcast name header

**Files:**
- Modify: `client/src/components/EpisodeList.tsx`
- Modify: `client/src/tests/EpisodeList.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing test**

Add to `client/src/tests/EpisodeList.test.tsx`:

```tsx
it('renders the podcast name at the top', () => {
  render(
    <EpisodeList
      podcastName="My Great Show"
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
    />
  )
  expect(screen.getByText('My Great Show')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/tests/EpisodeList.test.tsx
```

Expected: TypeScript error — `podcastName` prop not accepted.

- [ ] **Step 3: Update `client/src/components/EpisodeList.tsx`**

```tsx
import type { Season, Episode } from '../types'
import { usePlayerStore } from '../store/playerStore'
import SeasonTabs from './SeasonTabs'
import EpisodeItem from './EpisodeItem'

interface EpisodeListProps {
  podcastName: string
  seasons: Season[]
  episodes: Episode[]
  activeSeason: number | null
  onSeasonSelect: (seasonId: number) => void
}

export default function EpisodeList({ podcastName, seasons, episodes, activeSeason, onSeasonSelect }: EpisodeListProps) {
  const currentEpisode = usePlayerStore(state => state.episode)
  const setEpisode = usePlayerStore(state => state.setEpisode)
  const setPlaying = usePlayerStore(state => state.setPlaying)

  function handleEpisodeClick(ep: Episode) {
    setEpisode(ep)
    setPlaying(true)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 truncate">{podcastName}</h2>
      </div>
      <SeasonTabs seasons={seasons} activeSeason={activeSeason} onSelect={onSeasonSelect} />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {episodes.map(ep => (
          <EpisodeItem
            key={ep.id}
            episode={ep}
            isActive={currentEpisode?.id === ep.id}
            onClick={handleEpisodeClick}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update existing tests** — add `podcastName="Test Show"` to all existing `render(<EpisodeList ...>)` calls in `client/src/tests/EpisodeList.test.tsx`

```tsx
// Add podcastName prop to all three existing render calls, e.g.:
render(
  <EpisodeList
    podcastName="Test Show"
    seasons={seasons}
    episodes={episodes}
    activeSeason={1}
    onSeasonSelect={() => {}}
  />
)
```

- [ ] **Step 5: Update `client/src/App.tsx`** — pass `settings.podcast_name` to `EpisodeList`

```tsx
sidebar={
  <EpisodeList
    podcastName={settings.podcast_name}
    seasons={seasons}
    episodes={episodes}
    activeSeason={activeSeason}
    onSeasonSelect={handleSeasonSelect}
  />
}
```

- [ ] **Step 6: Run all EpisodeList tests**

```bash
cd client && npx vitest run src/tests/EpisodeList.test.tsx
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/EpisodeList.tsx client/src/tests/EpisodeList.test.tsx client/src/App.tsx
git commit -m "fix: EpisodeList renders podcast name at top of sidebar"
```

---

## Task 5: EpisodeItem — fix active state, add number/duration/guests, EQ indicator

**Files:**
- Modify: `client/src/components/EpisodeItem.tsx`
- Modify: `client/src/tests/EpisodeItem.test.tsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Write the failing tests**

Replace `client/src/tests/EpisodeItem.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach } from 'vitest'
import { usePlayerStore } from '../store/playerStore'
import EpisodeItem from '../components/EpisodeItem'
import type { Episode } from '../types'

const episode: Episode = {
  id: 1,
  season_id: 1,
  number: 3,
  title: 'Pilot Episode',
  description: 'The first one',
  guests: 'Alice, Bob',
  tags: '',
  cover_art_path: null,
  duration_seconds: 3661,  // 1h 1m 1s → "1:01:01"
  publish_date: '2024-01-15',
  audio_type: 'upload',
  audio_path: '/audio/ep1.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 0 })
})

it('renders episode number, title, publish_date, duration, and guests', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('Ep 3')).toBeInTheDocument()
  expect(screen.getByText('Pilot Episode')).toBeInTheDocument()
  expect(screen.getByText('2024-01-15')).toBeInTheDocument()
  expect(screen.getByText('1:01:01')).toBeInTheDocument()
  expect(screen.getByText(/Alice, Bob/i)).toBeInTheDocument()
})

it('calls onClick with episode when clicked', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<EpisodeItem episode={episode} isActive={false} onClick={onClick} />)
  await user.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalledWith(episode)
})

it('active state: left accent border and tinted background, no solid fill', () => {
  render(<EpisodeItem episode={episode} isActive={true} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).toHaveAttribute('aria-current', 'true')
  expect(btn).toHaveClass('border-l-2')
  expect(btn).not.toHaveClass('bg-[var(--accent)]')
})

it('inactive state: no aria-current, no border-l-2', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).not.toHaveAttribute('aria-current')
  expect(btn).not.toHaveClass('border-l-2')
})

it('shows EQ indicator when this episode is active and playing', () => {
  usePlayerStore.setState({ episode, playing: true })
  render(<EpisodeItem episode={episode} isActive={true} onClick={() => {}} />)
  expect(document.querySelector('.eq-bars')).toBeInTheDocument()
})

it('does not show EQ indicator when not playing', () => {
  usePlayerStore.setState({ episode, playing: false })
  render(<EpisodeItem episode={episode} isActive={true} onClick={() => {}} />)
  expect(document.querySelector('.eq-bars')).not.toBeInTheDocument()
})

it('formats duration < 1h as m:ss', () => {
  const short = { ...episode, duration_seconds: 185 }  // 3m 5s
  render(<EpisodeItem episode={short} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('3:05')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd client && npx vitest run src/tests/EpisodeItem.test.tsx
```

Expected: multiple failures.

- [ ] **Step 3: Add EQ animation to `client/src/index.css`**

Add these keyframes after existing content:

```css
@keyframes eq-bar {
  0%, 100% { transform: scaleY(0.4); }
  50%       { transform: scaleY(1); }
}
.eq-bar { animation: eq-bar 0.8s ease-in-out infinite; transform-origin: bottom; }
.eq-bar:nth-child(2) { animation-delay: 0.2s; }
.eq-bar:nth-child(3) { animation-delay: 0.4s; }
```

- [ ] **Step 4: Rewrite `client/src/components/EpisodeItem.tsx`**

```tsx
import type { Episode } from '../types'
import { usePlayerStore } from '../store/playerStore'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

interface EpisodeItemProps {
  episode: Episode
  isActive: boolean
  onClick: (episode: Episode) => void
}

export default function EpisodeItem({ episode, isActive, onClick }: EpisodeItemProps) {
  const playing = usePlayerStore(state => state.playing)
  const currentEpisode = usePlayerStore(state => state.episode)
  const isPlaying = isActive && playing && currentEpisode?.id === episode.id

  return (
    <button
      onClick={() => onClick(episode)}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-2 ${
        isActive
          ? 'border-l-2 border-[var(--accent)] bg-zinc-800/60 text-zinc-100'
          : 'hover:bg-zinc-800 text-zinc-300'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 shrink-0">Ep {episode.number}</span>
          <span className="text-sm font-medium truncate">{episode.title}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-500">{episode.publish_date}</span>
          <span className="text-xs text-zinc-500">·</span>
          <span className="text-xs text-zinc-500">{formatDuration(episode.duration_seconds)}</span>
          {episode.guests ? (
            <>
              <span className="text-xs text-zinc-500">·</span>
              <span className="text-xs text-zinc-400 italic truncate">{episode.guests}</span>
            </>
          ) : null}
        </div>
      </div>
      {isPlaying && (
        <div className="eq-bars flex items-end gap-px h-4 shrink-0 mt-1">
          <div className="eq-bar w-1 bg-[var(--accent)] rounded-sm h-full" />
          <div className="eq-bar w-1 bg-[var(--accent)] rounded-sm h-full" />
          <div className="eq-bar w-1 bg-[var(--accent)] rounded-sm h-full" />
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 5: Run all EpisodeItem tests**

```bash
cd client && npx vitest run src/tests/EpisodeItem.test.tsx
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/EpisodeItem.tsx client/src/tests/EpisodeItem.test.tsx client/src/index.css
git commit -m "fix: EpisodeItem shows ep number/duration/guests, correct active state, animated EQ indicator"
```

---

## Task 6: DetailPane — season/episode label, blue guest pills, purple tag pills, "About this episode" label

**Files:**
- Modify: `client/src/components/DetailPane.tsx`
- Modify: `client/src/tests/DetailPane.test.tsx`
- Modify: `client/src/App.tsx` (already done in Task 2 — just confirm `seasons` prop is passed)

- [ ] **Step 1: Write the failing tests**

Replace `client/src/tests/DetailPane.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import DetailPane from '../components/DetailPane'
import type { Episode, Season } from '../types'

const seasons: Season[] = [
  { id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z' },
]

const mockEpisode: Episode = {
  id: 1,
  season_id: 1,
  number: 4,
  title: 'My Great Episode',
  description: 'An interesting description',
  guests: 'Jane Doe, John Smith',
  tags: 'comedy, drama',
  cover_art_path: 'https://example.com/cover.jpg',
  duration_seconds: 3600,
  publish_date: '2024-03-15',
  audio_type: 'upload',
  audio_path: '/uploads/ep1.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

it('shows placeholder when episode is null', () => {
  render(<DetailPane episode={null} seasons={seasons} />)
  expect(screen.getByText('Select an episode to begin')).toBeInTheDocument()
})

it('shows episode title and publish_date', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('My Great Episode')).toBeInTheDocument()
  expect(screen.getByText('2024-03-15')).toBeInTheDocument()
})

it('shows season and episode label', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('Season One · Episode 4')).toBeInTheDocument()
})

it('renders each guest as a blue pill badge', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  const janeEl = screen.getByText('Jane Doe')
  const johnEl = screen.getByText('John Smith')
  expect(janeEl).toHaveClass('bg-blue-900')
  expect(johnEl).toHaveClass('bg-blue-900')
})

it('renders each tag as a purple pill badge', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  const comedyEl = screen.getByText('comedy')
  const dramaEl = screen.getByText('drama')
  expect(comedyEl).toHaveClass('bg-purple-900')
  expect(dramaEl).toHaveClass('bg-purple-900')
})

it('shows "About this episode" label before description', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('About this episode')).toBeInTheDocument()
  expect(screen.getByText('An interesting description')).toBeInTheDocument()
})

it('renders cover art image when cover_art_path is set', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByRole('img', { name: 'My Great Episode' })).toBeInTheDocument()
})

it('does not render img when cover_art_path is null', () => {
  render(<DetailPane episode={{ ...mockEpisode, cover_art_path: null }} seasons={seasons} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd client && npx vitest run src/tests/DetailPane.test.tsx
```

Expected: failures for missing season label, wrong pill colors, missing "About this episode".

- [ ] **Step 3: Rewrite `client/src/components/DetailPane.tsx`**

```tsx
import type { Episode, Season } from '../types'
import PillBadge from './PillBadge'

interface DetailPaneProps {
  episode: Episode | null
  seasons: Season[]
}

export default function DetailPane({ episode, seasons }: DetailPaneProps) {
  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p>Select an episode to begin</p>
      </div>
    )
  }

  const season = seasons.find(s => s.id === episode.season_id)
  const seasonLabel = season ? `${season.title} · Episode ${episode.number}` : `Episode ${episode.number}`

  const guestList = episode.guests
    ? episode.guests.split(',').map(g => g.trim()).filter(Boolean)
    : []

  const tagList = episode.tags
    ? episode.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []

  return (
    <div className="p-8 pb-48">
      {episode.cover_art_path && (
        <img
          src={episode.cover_art_path}
          alt={episode.title}
          className="mb-6 w-48 rounded-xl shadow-lg"
        />
      )}
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">{seasonLabel}</p>
      <h1 className="text-2xl font-bold text-zinc-100">{episode.title}</h1>
      <p className="mt-1 text-sm text-zinc-400">{episode.publish_date}</p>

      {guestList.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {guestList.map(guest => (
            <PillBadge key={guest} label={guest} className="bg-blue-900 text-blue-200" />
          ))}
        </div>
      )}

      {tagList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {tagList.map(tag => (
            <PillBadge key={tag} label={tag} className="bg-purple-900 text-purple-200" />
          ))}
        </div>
      )}

      {episode.description && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">About this episode</p>
          <p className="leading-relaxed text-zinc-300">{episode.description}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all DetailPane tests**

```bash
cd client && npx vitest run src/tests/DetailPane.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DetailPane.tsx client/src/tests/DetailPane.test.tsx
git commit -m "fix: DetailPane shows season/episode label, blue guest pills, purple tag pills, About label"
```

---

## Task 7: AudioPlayer + playerStore — full controls (skip, seek, speed, timestamps)

**Files:**
- Modify: `client/src/store/playerStore.ts`
- Modify: `client/src/components/AudioPlayer.tsx`
- Modify: `client/src/tests/playerStore.test.ts`
- Modify: `client/src/tests/AudioPlayer.test.tsx`

- [ ] **Step 1: Write the failing playerStore test**

Add to `client/src/tests/playerStore.test.ts` (keep existing tests, add):

```ts
import { usePlayerStore } from '../store/playerStore'

beforeEach(() => {
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 0, speed: 1 })
})

it('has default speed of 1', () => {
  expect(usePlayerStore.getState().speed).toBe(1)
})

it('setSpeed updates speed', () => {
  usePlayerStore.getState().setSpeed(1.5)
  expect(usePlayerStore.getState().speed).toBe(1.5)
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/tests/playerStore.test.ts
```

Expected: failure — `speed` and `setSpeed` do not exist.

- [ ] **Step 3: Update `client/src/store/playerStore.ts`**

```ts
import { create } from 'zustand'
import type { Episode } from '../types'

interface PlayerState {
  episode: Episode | null
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  setEpisode: (ep: Episode) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  setSpeed: (speed: number) => void
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  episode: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  speed: 1,
  setEpisode: (ep) => set({ episode: ep }),
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setSpeed: (speed) => set({ speed }),
}))
```

- [ ] **Step 4: Run playerStore tests**

```bash
cd client && npx vitest run src/tests/playerStore.test.ts
```

Expected: all pass.

- [ ] **Step 5: Write the failing AudioPlayer tests**

Replace `client/src/tests/AudioPlayer.test.tsx` with:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { usePlayerStore } from '../store/playerStore'
import AudioPlayer from '../components/AudioPlayer'
import type { Episode } from '../types'

HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLMediaElement.prototype.pause = vi.fn()
HTMLMediaElement.prototype.load = vi.fn()

const mockEpisode: Episode = {
  id: 1,
  season_id: 1,
  number: 1,
  title: 'Test Episode',
  description: 'A test episode',
  guests: 'Alice, Bob',
  tags: 'tech,news',
  cover_art_path: null,
  duration_seconds: 120,
  publish_date: '2024-01-01',
  audio_type: 'url',
  audio_path: 'https://example.com/episode.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 120, speed: 1 })
  vi.clearAllMocks()
})

it('renders nothing when there is no episode in store', () => {
  const { container } = render(<AudioPlayer />)
  expect(container.firstChild).toBeNull()
})

it('renders episode title and play button when episode is in store', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByText('Test Episode')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
})

it('shows pause button when playing', () => {
  usePlayerStore.setState({ episode: mockEpisode, playing: true })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
})

it('clicking play button sets playing to true', () => {
  usePlayerStore.setState({ episode: mockEpisode, playing: false })
  render(<AudioPlayer />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(usePlayerStore.getState().playing).toBe(true)
})

it('renders skip-to-start button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Skip to start' })).toBeInTheDocument()
})

it('renders skip back 15s button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument()
})

it('renders skip forward 15s button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeInTheDocument()
})

it('renders skip to end button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Skip to end' })).toBeInTheDocument()
})

it('renders speed toggle defaulting to 1×', () => {
  usePlayerStore.setState({ episode: mockEpisode, speed: 1 })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: /speed/i })).toHaveTextContent('1×')
})

it('clicking speed toggle cycles 1→1.5→2→1', () => {
  usePlayerStore.setState({ episode: mockEpisode, speed: 1 })
  render(<AudioPlayer />)
  const btn = screen.getByRole('button', { name: /speed/i })
  fireEvent.click(btn)
  expect(usePlayerStore.getState().speed).toBe(1.5)
  fireEvent.click(btn)
  expect(usePlayerStore.getState().speed).toBe(2)
  fireEvent.click(btn)
  expect(usePlayerStore.getState().speed).toBe(1)
})

it('displays elapsed and remaining timestamps', () => {
  usePlayerStore.setState({ episode: mockEpisode, currentTime: 65, duration: 120 })
  render(<AudioPlayer />)
  expect(screen.getByText('1:05')).toBeInTheDocument()  // elapsed
  expect(screen.getByText('-0:55')).toBeInTheDocument() // remaining
})
```

- [ ] **Step 6: Run tests to confirm they fail**

```bash
cd client && npx vitest run src/tests/AudioPlayer.test.tsx
```

Expected: failures for missing skip buttons, speed toggle, timestamps.

- [ ] **Step 7: Rewrite `client/src/components/AudioPlayer.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import ProgressBar from './ProgressBar'

function formatTime(seconds: number, showSign = false): string {
  const abs = Math.floor(Math.abs(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  const str = `${m}:${String(s).padStart(2, '0')}`
  return showSign && seconds < 0 ? `-${str}` : str
}

const SPEEDS = [1, 1.5, 2] as const

export default function AudioPlayer() {
  const { episode, playing, currentTime, duration, speed, setPlaying, setCurrentTime, setDuration, setSpeed } =
    usePlayerStore()
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !episode) return
    audio.src = episode.audio_path
    audio.load()
  }, [episode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) void audio.play()
    else audio.pause()
  }, [playing])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  const handleSeek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const skipTo = (time: number) => {
    const clamped = Math.max(0, Math.min(time, duration))
    handleSeek(clamped)
  }

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as typeof SPEEDS[number])
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length])
  }

  if (!episode) return null

  const remaining = currentTime - duration

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900 px-6 py-3">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className="mx-auto max-w-3xl space-y-2">
        <div className="truncate text-sm font-medium text-zinc-100">{episode.title}</div>
        <ProgressBar currentTime={currentTime} duration={duration} onSeek={handleSeek} />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(remaining, true)}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => skipTo(0)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Skip to start"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>
          <button
            onClick={() => skipTo(currentTime - 15)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Back 15 seconds"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              <text x="8" y="16" fontSize="6" fill="currentColor">15</text>
            </svg>
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className="rounded-full bg-[var(--accent)] p-3 text-white transition-opacity hover:opacity-90"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => skipTo(currentTime + 15)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Forward 15 seconds"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
              <text x="8" y="16" fontSize="6" fill="currentColor">15</text>
            </svg>
          </button>
          <button
            onClick={() => skipTo(duration)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Skip to end"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z"/>
            </svg>
          </button>
          <button
            onClick={cycleSpeed}
            className="rounded px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors min-w-[2.5rem] text-center"
            aria-label="Playback speed"
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run all AudioPlayer tests**

```bash
cd client && npx vitest run src/tests/AudioPlayer.test.tsx
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add client/src/store/playerStore.ts client/src/components/AudioPlayer.tsx client/src/tests/playerStore.test.ts client/src/tests/AudioPlayer.test.tsx
git commit -m "fix: AudioPlayer has full controls — skip, ±15s, speed toggle, timestamps"
```

---

## Task 8: Full client test suite pass

After all client component changes, run the full suite to catch any cross-component regressions introduced by prop signature changes.

- [ ] **Step 1: Run full client test suite**

```bash
cd client && npm test
```

Expected: all tests pass. If any fail, the most likely cause is a component test that renders `<DetailPane episode={...} />` without the new required `seasons` prop — add `seasons={[]}` to those render calls.

- [ ] **Step 2: Fix any failing tests**

If `App.test.tsx` fails because `DetailPane` now requires `seasons`, update the mock in `client/src/tests/App.test.tsx` to ensure the seasons API mock returns an array and the component receives it.

- [ ] **Step 3: Run lint**

```bash
cd client && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -p
git commit -m "fix: update remaining tests for new component prop signatures"
```

---

## Task 9: Production architecture — single image, single port

**Files:**
- Modify: `server/src/app.ts` — add client dist static serving when `SERVE_CLIENT=true`
- Create: `Dockerfile` (repo root) — 3-stage build
- Modify: `docker-compose.prod.yml` — single service on port 3000

The spec says:  
> "Stage 1 builds the React app with Vite. Stage 2 copies the build into the Fastify server, which serves the static files and the API on a single port (default 3000)."

The Fastify server will serve `/api/*` and `/audio/*` as before, and add:
- Static files from `/dist/client` at `/`
- A catch-all that returns `index.html` for all unmatched GET requests (SPA fallback)

- [ ] **Step 1: Write the failing server test**

Add to `server/tests/app.test.ts` (or create `server/tests/static.test.ts`):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { FastifyInstance } from 'fastify'

describe('static file serving', () => {
  let app: FastifyInstance
  let tmpDir: string

  beforeAll(async () => {
    // Create a temp client dist directory with an index.html
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-test-'))
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>SPA</body></html>')
    process.env.SERVE_CLIENT = 'true'
    app = buildApp({ dbPath: ':memory:', logger: false, clientDistPath: tmpDir })
    await app.ready()
  })

  afterAll(async () => {
    delete process.env.SERVE_CLIENT
    fs.rmSync(tmpDir, { recursive: true })
    await app.close()
  })

  it('serves index.html at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SPA')
  })

  it('serves index.html for unknown routes (SPA fallback)', async () => {
    const res = await app.inject({ method: 'GET', url: '/some/deep/route' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SPA')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd server && npm test -- --reporter=verbose 2>&1 | grep -A5 "static file serving"
```

Expected: failures — `clientDistPath` option not accepted, no static serving.

- [ ] **Step 3: Update `server/src/app.ts`** — add `clientDistPath` option and static + catch-all routes

```ts
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import path from 'node:path'
import fs from 'node:fs'
import type { Database } from 'better-sqlite3'
import { initDb } from './db/index.js'
import { settingsRoute } from './routes/settings.js'
import { seasonsRoute } from './routes/seasons.js'
import { episodesRoute } from './routes/episodes.js'
import { adminAuthRoute } from './routes/admin/auth.js'
import { adminSeasonsRoute } from './routes/admin/seasons.js'
import { adminEpisodesRoute } from './routes/admin/episodes.js'
import { adminUploadRoute } from './routes/admin/upload.js'
import { adminSettingsRoute } from './routes/admin/settings.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
  }
}

interface AppOptions {
  dbPath?: string
  logger?: boolean
  clientDistPath?: string
}

export function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true })
  const dbPath = opts.dbPath ?? path.resolve('data/db.sqlite')
  const db = initDb(dbPath)

  app.decorate('db', db)

  app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-secret-change-in-production'
  })

  app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

  if (dbPath !== ':memory:') {
    const uploadsDir = path.resolve('data/uploads')
    app.register(staticPlugin, { root: uploadsDir, prefix: '/audio/', decorateReply: false })
  }

  const clientDist = opts.clientDistPath ?? (
    process.env.SERVE_CLIENT === 'true' ? path.resolve('dist/client') : null
  )
  if (clientDist && fs.existsSync(clientDist)) {
    app.register(staticPlugin, {
      root: clientDist,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
    })
    app.setNotFoundHandler((_req, reply) => {
      void reply.sendFile('index.html', clientDist)
    })
  }

  app.addHook('onClose', () => { db.close() })

  if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
    throw new Error('COOKIE_SECRET env var is required in production')
  }

  app.register(settingsRoute, { prefix: '/api' })
  app.register(seasonsRoute, { prefix: '/api' })
  app.register(episodesRoute, { prefix: '/api' })
  app.register(adminAuthRoute, { prefix: '/api' })
  app.register(adminSeasonsRoute, { prefix: '/api' })
  app.register(adminEpisodesRoute, { prefix: '/api' })
  app.register(adminUploadRoute, { prefix: '/api' })
  app.register(adminSettingsRoute, { prefix: '/api' })

  return app
}
```

- [ ] **Step 4: Run the static serving tests**

```bash
cd server && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|static)"
```

Expected: all tests in the static file serving describe block pass.

- [ ] **Step 5: Run full server test suite**

```bash
cd server && npm test
```

Expected: all 49+ tests pass (existing tests unaffected).

- [ ] **Step 6: Commit server changes**

```bash
git add server/src/app.ts server/tests/static.test.ts
git commit -m "feat: server serves client dist as SPA when SERVE_CLIENT=true"
```

- [ ] **Step 7: Create root `Dockerfile`**

Create `/Dockerfile` at the project root:

```dockerfile
# Stage 1: Build React client
FROM node:20-alpine AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Build Fastify server (TypeScript only, no native addons)
FROM node:20-alpine AS server-builder
WORKDIR /server
COPY server/package*.json ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /server/dist ./dist
COPY --from=client-builder /client/dist ./dist/client
RUN mkdir -p data/uploads
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 8: Replace `docker-compose.prod.yml`**

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - SERVE_CLIENT=true
      - PORT=3000
      - COOKIE_SECRET=${COOKIE_SECRET:?COOKIE_SECRET must be set}
      - ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH:?ADMIN_PASSWORD_HASH must be set}
```

- [ ] **Step 9: Verify the production build**

```bash
docker build -t ear-candy-prod . 2>&1 | tail -5
```

Expected: `Successfully built ...` with no errors.

- [ ] **Step 10: Smoke test the production image**

```bash
docker run --rm -d \
  -p 3000:3000 \
  -e COOKIE_SECRET=test-secret \
  -e ADMIN_PASSWORD_HASH='$2b$10$test' \
  --name ear-candy-smoke \
  ear-candy-prod

sleep 3
curl -s http://localhost:3000/ | grep -c "SPA\|html\|react\|<!DOCTYPE"
curl -s http://localhost:3000/api/settings | grep -c "podcast_name"
curl -s http://localhost:3000/some/spa/route | grep -c "SPA\|html\|react\|<!DOCTYPE"
docker stop ear-candy-smoke
```

Expected: each `curl` returns count ≥ 1.

- [ ] **Step 11: Update `Makefile`** — replace `build-prod` and `up-prod` targets to use root Dockerfile

```makefile
build-prod:
	docker build -t ear-candy .

up-prod:
	docker compose -f docker-compose.prod.yml up -d
```

- [ ] **Step 12: Commit**

```bash
git add Dockerfile docker-compose.prod.yml Makefile
git commit -m "fix: production is a single image/port/volume — Fastify serves client dist"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Icon Rail: logo + Episodes/Seasons/Search nav icons | Task 3 |
| Dark/light toggle (☀/🌙) bottom-right of shell, localStorage | Tasks 1 + 2 |
| Accent color via `--accent` CSS var | Unchanged — already correct |
| Episode list: podcast name at top | Task 4 |
| Episode list: ep number, title, date, duration, guests preview | Task 5 |
| Active episode: left accent border + tinted bg | Task 5 |
| Animated EQ bar indicator when playing | Task 5 |
| Detail pane: season/episode label | Task 6 |
| Detail pane: guest pills blue, tag pills purple | Task 6 |
| Detail pane: "About this episode" label | Task 6 |
| Player: skip-to-start, −15s, +15s, skip-to-end | Task 7 |
| Player: speed toggle 1×/1.5×/2× | Task 7 |
| Player: timestamp (elapsed / remaining) | Task 7 |
| Full test suite passes after changes | Task 8 |
| Production: single image, single port (3000), single volume | Task 9 |

**Placeholder scan:** None found — all steps contain actual code and commands.

**Type consistency:** `DetailPane` gains `seasons: Season[]` prop — wired in Task 2 (App.tsx) and tested in Task 6. `EpisodeList` gains `podcastName: string` — wired in Task 4. `PlayerState` gains `speed/setSpeed` — added in Task 7 step 3 before AudioPlayer uses it in step 7.
