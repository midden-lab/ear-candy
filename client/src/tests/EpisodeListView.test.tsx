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
      podcastName="Test Show"
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
      podcastName="Test Show"
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
      podcastName="Test Show"
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
      podcastName="Test Show"
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
      podcastName="Test Show"
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
      podcastName="Test Show"
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
      podcastName="Test Show"
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      getRemainingSeconds={ep => (ep.id === 10 ? 65 : undefined)}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.getByText('1:05').closest('span')?.parentElement).toHaveTextContent('1:05 left')
})

it('renders the podcast name at the top', () => {
  render(
    <EpisodeListView
      podcastName="My Great Show"
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
      onEpisodeClick={() => {}}
    />
  )
  expect(screen.getByText('My Great Show')).toBeInTheDocument()
})

it('shows a loading indicator instead of episodes when loading', () => {
  render(
    <EpisodeListView
      podcastName="Test Show"
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
      podcastName="Test Show"
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

  it('renders the SeasonChip dropdown instead of the SeasonTabs pill row', () => {
    mockMobile()
    render(
      <EpisodeListView
        podcastName="Test Show"
        seasons={seasons}
        episodes={episodes}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Season One' })).toHaveAttribute('aria-haspopup', 'listbox')
  })

  it('still renders the podcast name and episode items on mobile', () => {
    mockMobile()
    render(
      <EpisodeListView
        podcastName="Test Show"
        seasons={seasons}
        episodes={episodes}
        activeSeason={1}
        onSeasonSelect={() => {}}
        onEpisodeClick={() => {}}
      />
    )
    expect(screen.getByText('Test Show')).toBeInTheDocument()
    expect(screen.getByText('First Episode')).toBeInTheDocument()
  })
})
