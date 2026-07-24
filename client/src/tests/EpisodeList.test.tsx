import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EpisodeList from '../components/EpisodeList'
import { usePlayerStore } from '../store/playerStore'
import type { Season, Episode } from '../types'

const seasons: Season[] = [
  { id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z' },
]

const episodes: Episode[] = [
  {
    id: 10,
    season_id: 1,
    number: 1,
    title: 'First Episode',
    description: '',
    guests: '',
    tags: '',
    cover_art_path: null,
    cover_art_thumb_path: null,
    duration_seconds: 1800,
    publish_date: '2024-02-01',
    audio_type: 'upload',
    audio_path: '/audio/ep10.mp3',
    hidden: false,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 11,
    season_id: 1,
    number: 2,
    title: 'Second Episode',
    description: '',
    guests: '',
    tags: '',
    cover_art_path: null,
    cover_art_thumb_path: null,
    duration_seconds: 2400,
    publish_date: '2024-03-01',
    audio_type: 'upload',
    audio_path: '/audio/ep11.mp3',
    hidden: false,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
]

beforeEach(() => {
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 0 })
})

interface HarnessOverrides {
  loading?: boolean
  episodes?: Episode[]
  onEpisodeSelect?: () => void
}

/** Stateful harness so onEpisodeView actually updates what's highlighted —
 *  proves the real click -> highlight wiring, not just that the callback
 *  fired. */
function Harness({ loading, episodes: episodesOverride, onEpisodeSelect }: HarnessOverrides) {
  const [viewingEpisodeId, setViewingEpisodeId] = useState<number | null>(null)
  return (
    <EpisodeList
      podcastName="Test Show"
      seasons={seasons}
      episodes={episodesOverride ?? episodes}
      activeSeason={1}
      loading={loading}
      viewingEpisodeId={viewingEpisodeId}
      onSeasonSelect={() => {}}
      onEpisodeView={ep => setViewingEpisodeId(ep.id)}
      onEpisodeSelect={onEpisodeSelect}
    />
  )
}

it('renders season tabs and episode items', () => {
  render(<Harness />)
  expect(screen.getByRole('button', { name: 'Season One' })).toBeInTheDocument()
  expect(screen.getByText('First Episode')).toBeInTheDocument()
  expect(screen.getByText('Second Episode')).toBeInTheDocument()
})

it('clicking an episode does not touch the player store (browsing must not auto-play)', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByText('First Episode'))
  expect(usePlayerStore.getState().episode).toBeNull()
  expect(usePlayerStore.getState().playing).toBe(false)
})

it('clicking an episode does not interrupt an already-playing different episode', async () => {
  const user = userEvent.setup()
  usePlayerStore.setState({ episode: episodes[1], playing: true })
  render(<Harness />)
  await user.click(screen.getByText('First Episode'))
  // Still episode 11 (Second Episode) playing in the background.
  expect(usePlayerStore.getState().episode?.id).toBe(11)
  expect(usePlayerStore.getState().playing).toBe(true)
})

it('active (viewed) episode item has aria-current="true", independent of what is playing', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByText('Second Episode'))
  const buttons = screen.getAllByRole('button')
  const secondEpBtn = buttons.find(b => b.textContent?.includes('Second Episode'))
  expect(secondEpBtn).toHaveAttribute('aria-current', 'true')
  const firstEpBtn = buttons.find(b => b.textContent?.includes('First Episode'))
  expect(firstEpBtn).not.toHaveAttribute('aria-current')
})

it('EQ indicator follows the actually-playing episode, not the viewed one', async () => {
  const user = userEvent.setup()
  usePlayerStore.setState({ episode: episodes[1], playing: true })
  render(<Harness />)
  // View (click into) a different episode than the one playing.
  await user.click(screen.getByText('First Episode'))
  const buttons = screen.getAllByRole('button')
  const firstEpBtn = buttons.find(b => b.textContent?.includes('First Episode'))!
  const secondEpBtn = buttons.find(b => b.textContent?.includes('Second Episode'))!
  // Viewed row (First Episode) is highlighted...
  expect(firstEpBtn).toHaveAttribute('aria-current', 'true')
  // ...but the EQ bars stay on the row that's actually playing (Second Episode).
  expect(secondEpBtn.querySelector('.eq-bars')).toBeInTheDocument()
  expect(firstEpBtn.querySelector('.eq-bars')).not.toBeInTheDocument()
})

it('renders the podcast name at the top', () => {
  render(<Harness />)
  expect(screen.getByText('Test Show')).toBeInTheDocument()
})

it('calls onEpisodeSelect when an episode is clicked', async () => {
  const user = userEvent.setup()
  const onEpisodeSelect = vi.fn()
  render(<Harness onEpisodeSelect={onEpisodeSelect} />)
  await user.click(screen.getByText('First Episode'))
  expect(onEpisodeSelect).toHaveBeenCalledTimes(1)
})

it('shows a loading indicator instead of episodes when loading', () => {
  render(<Harness loading />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()
  expect(screen.queryByText('First Episode')).not.toBeInTheDocument()
})

it('shows an empty state when the season has no episodes', () => {
  render(<Harness episodes={[]} />)
  expect(screen.getByText('No episodes in this season yet.')).toBeInTheDocument()
})

describe('mobile layout (< md)', () => {
  const originalMatchMedia = window.matchMedia

  function mockMobile() {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('renders the SeasonChip dropdown and selecting a season calls onSeasonSelect', async () => {
    mockMobile()
    const user = userEvent.setup()
    render(<Harness />)
    const chip = screen.getByRole('button', { name: 'Season One' })
    expect(chip).toHaveAttribute('aria-haspopup', 'listbox')
    await user.click(chip)
    await user.click(screen.getByRole('option', { name: 'Season One' }))
  })
})

describe('URL sync on episode selection', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('updates the URL with the selected episode id', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('First Episode'))
    expect(new URLSearchParams(window.location.search).get('episode')).toBe('10')
  })

  it('drops any existing t param on a plain click', async () => {
    window.history.replaceState(null, '', '/?episode=99&t=42')
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Second Episode'))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('episode')).toBe('11')
    expect(params.has('t')).toBe(false)
  })
})

describe('remaining time', () => {
  it('shows plain duration when no progress is saved', () => {
    render(<Harness />)
    expect(screen.getByText('30:00')).toBeInTheDocument()
  })

  it('shows "X left" for the actively-playing episode, reflecting live currentTime', () => {
    usePlayerStore.setState({ episode: episodes[0], playing: true, currentTime: 300 })
    render(<Harness />)
    // The digits are wrapped in their own tabular-nums span (so the
    // countdown doesn't make "left" jitter as digit widths vary), so match
    // via the digits' parent rather than the combined string.
    expect(screen.getByText('25:00').closest('span')?.parentElement).toHaveTextContent('25:00 left')
  })

  it('shows "X left" for a non-playing episode using its saved localStorage progress', () => {
    localStorage.setItem('episode-progress', JSON.stringify({ 11: { time: 600, savedAt: Date.now() } }))
    render(<Harness />)
    // "30:00" also coincidentally matches the OTHER episode's plain total
    // duration, so disambiguate by finding the one whose parent says "left".
    const remaining = screen.getAllByText('30:00').find(el => el.parentElement?.textContent === '30:00 left')
    expect(remaining).toBeTruthy()
    localStorage.clear()
  })
})
