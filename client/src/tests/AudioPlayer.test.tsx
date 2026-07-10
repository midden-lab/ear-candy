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
