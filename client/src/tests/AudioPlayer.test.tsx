import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, afterEach, describe } from 'vitest'
import { usePlayerStore } from '../store/playerStore'
import AudioPlayer from '../components/AudioPlayer'
import type { Episode } from '../types'

HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLMediaElement.prototype.pause = vi.fn()
HTMLMediaElement.prototype.load = vi.fn()

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

it('renders back 15 seconds button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument()
})

it('renders forward 15 seconds button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeInTheDocument()
})

it('renders skip to end button', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByRole('button', { name: 'Skip to end' })).toBeInTheDocument()
})

it('renders speed toggle showing current speed', () => {
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
  expect(screen.getByText('1:05')).toBeInTheDocument()
  expect(screen.getByText('-0:55')).toBeInTheDocument()
})

describe('mobile (< md)', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('renders a compact mini-bar by default, not the full transport controls', () => {
    mockMobile()
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    expect(screen.getByText('Test Episode')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip to start' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /speed/i })).not.toBeInTheDocument()
  })

  it('title truncates correctly next to the play button (min-w-0 regression guard)', () => {
    mockMobile()
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    const title = screen.getByText('Test Episode')
    expect(title).toHaveClass('truncate')
    expect(title.parentElement).toHaveClass('min-w-0')
  })

  it('tapping the mini-bar expands to the full-screen overlay with all transport controls', async () => {
    const user = userEvent.setup()
    mockMobile()
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    expect(screen.getByRole('button', { name: 'Skip to start' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /speed/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse now playing' })).toBeInTheDocument()
  })

  it('collapses back to the mini-bar when the collapse control is tapped', async () => {
    const user = userEvent.setup()
    mockMobile()
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    await user.click(screen.getByRole('button', { name: 'Collapse now playing' }))
    expect(screen.queryByRole('button', { name: 'Collapse now playing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip to start' })).not.toBeInTheDocument()
  })

  it('mini-bar play/pause button toggles playing without expanding the overlay', () => {
    mockMobile()
    usePlayerStore.setState({ episode: mockEpisode, playing: false })
    render(<AudioPlayer />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(usePlayerStore.getState().playing).toBe(true)
    expect(screen.queryByRole('button', { name: 'Collapse now playing' })).not.toBeInTheDocument()
  })
})
