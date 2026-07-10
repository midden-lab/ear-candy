import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

it('renders season tabs and episode items', () => {
  render(
    <EpisodeList
      podcastName="Test Show"
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
    />
  )
  expect(screen.getByRole('button', { name: 'Season One' })).toBeInTheDocument()
  expect(screen.getByText('First Episode')).toBeInTheDocument()
  expect(screen.getByText('Second Episode')).toBeInTheDocument()
})

it('clicking an episode sets it as active in the player store', async () => {
  const user = userEvent.setup()
  render(
    <EpisodeList
      podcastName="Test Show"
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
    />
  )
  await user.click(screen.getByText('First Episode'))
  expect(usePlayerStore.getState().episode?.id).toBe(10)
  expect(usePlayerStore.getState().playing).toBe(true)
})

it('active episode item has isActive=true (aria-current="true")', async () => {
  const user = userEvent.setup()
  render(
    <EpisodeList
      podcastName="Test Show"
      seasons={seasons}
      episodes={episodes}
      activeSeason={1}
      onSeasonSelect={() => {}}
    />
  )
  await user.click(screen.getByText('Second Episode'))
  // After clicking Second Episode, it should be active
  const buttons = screen.getAllByRole('button')
  // Find the button containing "Second Episode"
  const secondEpBtn = buttons.find(b => b.textContent?.includes('Second Episode'))
  expect(secondEpBtn).toHaveAttribute('aria-current', 'true')
  // First episode should not be active
  const firstEpBtn = buttons.find(b => b.textContent?.includes('First Episode'))
  expect(firstEpBtn).not.toHaveAttribute('aria-current')
})

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
