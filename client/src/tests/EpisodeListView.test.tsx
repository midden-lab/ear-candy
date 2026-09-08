import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EpisodeListView from '../components/EpisodeListView'
import type { Season, Episode } from '../types'

// Full container-wiring coverage (store integration, onEpisodeSelect
// side-channel) lives in EpisodeList.test.tsx. These tests exercise the
// presentational component directly via props only — no store.

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

it('renders season tabs and episode items', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.getByRole('button', { name: 'Season One' })).toBeInTheDocument()
  expect(screen.getByText('First Episode')).toBeInTheDocument()
  expect(screen.getByText('Second Episode')).toBeInTheDocument()
})

it('calls onEpisodeClick with the clicked episode', async () => {
  const user = userEvent.setup()
  const onEpisodeClick = vi.fn()
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
      onEpisodeClick={onEpisodeClick}
    />
  )
  await user.click(screen.getByText('First Episode'))
  expect(onEpisodeClick).toHaveBeenCalledWith(episodes[0])
})

it('marks the episode matching activeEpisodeId as active (aria-current)', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      activeEpisodeId={11}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  const buttons = screen.getAllByRole('button')
  const secondEpBtn = buttons.find(b => b.textContent?.includes('Second Episode'))
  const firstEpBtn = buttons.find(b => b.textContent?.includes('First Episode'))
  expect(secondEpBtn).toHaveAttribute('aria-current', 'true')
  expect(firstEpBtn).not.toHaveAttribute('aria-current')
})

it('shows the EQ indicator only for the playing episode when playing is true', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      playingEpisodeId={10}
      playing={true}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  const buttons = screen.getAllByRole('button')
  const firstEpBtn = buttons.find(b => b.textContent?.includes('First Episode'))
  expect(firstEpBtn?.querySelector('.eq-bars')).not.toBeNull()
})

it('EQ indicator follows playingEpisodeId independently of activeEpisodeId (viewed vs. playing can differ)', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      activeEpisodeId={11}
      playingEpisodeId={10}
      playing={true}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  const buttons = screen.getAllByRole('button')
  const firstEpBtn = buttons.find(b => b.textContent?.includes('First Episode'))
  const secondEpBtn = buttons.find(b => b.textContent?.includes('Second Episode'))
  expect(firstEpBtn?.querySelector('.eq-bars')).not.toBeNull()
  expect(secondEpBtn?.querySelector('.eq-bars')).toBeNull()
  expect(secondEpBtn).toHaveAttribute('aria-current', 'true')
})

it('does not show the EQ indicator when playing is false', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      activeEpisodeId={10}
      playing={false}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(document.querySelector('.eq-bars')).toBeNull()
})

it('passes each episode through getRemainingSeconds and renders the result per row', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      getRemainingSeconds={ep => (ep.id === 10 ? 65 : undefined)}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.getByText('1:05 left')).toBeInTheDocument()
})

it('renders the PrivacyNotice disclosure when analyticsEnabled is true', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      analyticsEnabled={true}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.getByText('Anonymous listening analytics')).toBeInTheDocument()
})

it('omits the PrivacyNotice disclosure when analyticsEnabled is omitted (defaults to false)', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.queryByText('Anonymous listening analytics')).not.toBeInTheDocument()
})

it('shows a loading indicator instead of episodes when loading', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      loading
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.getByText('Loading…')).toBeInTheDocument()
  expect(screen.queryByText('First Episode')).not.toBeInTheDocument()
})

it('shows an empty state when the season has no episodes', () => {
  render(
    <EpisodeListView
      seasons={seasons}
      episodes={[]}
      activeSeason={1}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
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

  it('renders the SeasonPicker full-screen selector instead of the SeasonTabs pill row', () => {
    mockMobile()
    render(
      <EpisodeListView
        seasons={seasons}
        episodes={episodes}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Season One' })).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('still renders episode items on mobile', () => {
    mockMobile()
    render(
      <EpisodeListView
        seasons={seasons}
        episodes={episodes}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText('First Episode')).toBeInTheDocument()
  })
})

describe('cross-catalog search', () => {
  const seasonTwo: Season = { id: 2, number: 2, title: 'Season Two', description: '', cover_art_path: null, hidden: false, created_at: '2024-04-01T00:00:00Z' }
  const seasonTwoEpisode: Episode = {
    ...episodes[0],
    id: 20,
    season_id: 2,
    number: 1,
    title: 'A Very Different Topic',
    guests: 'Special Guest',
  }
  const allEpisodes = [...episodes, seasonTwoEpisode]

  it('filters the visible list to search matches across every season, not just the active one', () => {
    render(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery="Different Topic"
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText('A Very Different Topic')).toBeInTheDocument()
    expect(screen.queryByText('First Episode')).not.toBeInTheDocument()
    expect(screen.queryByText('Second Episode')).not.toBeInTheDocument()
  })

  it('tags a cross-season search result with its origin season', () => {
    render(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery="Different Topic"
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText('S2')).toBeInTheDocument()
  })

  it('matches on guest name across seasons too', () => {
    render(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery="special guest"
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText('A Very Different Topic')).toBeInTheDocument()
  })

  it('shows a no-results message when nothing matches the search', () => {
    render(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery="nonexistent"
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText(/No episodes match/)).toBeInTheDocument()
  })

  it('reverts to season-scoped browsing when the search query is cleared', () => {
    const { rerender } = render(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery="Different Topic"
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.queryByText('First Episode')).not.toBeInTheDocument()

    rerender(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery=""
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText('First Episode')).toBeInTheDocument()
    expect(screen.queryByText('A Very Different Topic')).not.toBeInTheDocument()
  })

  it('keeps the season selector visible during search (matches the mockup — it never hides it), and switches the status text to a result count', () => {
    render(
      <EpisodeListView
        seasons={[seasons[0], seasonTwo]}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery="Different Topic"
        onSearchChange={() => {}}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Season One' })).toBeInTheDocument()
    expect(screen.getByText('1 result')).toBeInTheDocument()
  })

  it('calls onSearchChange as the user types into the search box', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(
      <EpisodeListView
        seasons={seasons}
        episodes={episodes}
        allEpisodes={allEpisodes}
        searchQuery=""
        onSearchChange={onSearchChange}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    await user.type(screen.getByRole('textbox', { name: 'Search episodes' }), 'x')
    expect(onSearchChange).toHaveBeenCalledWith('x')
  })
})
