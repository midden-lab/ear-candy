import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { usePlayerStore } from '../store/playerStore'
import AudioPlayer from '../components/AudioPlayer'
import type { Episode } from '../types'

// Full behavioral coverage (mini-bar, expand/collapse, transport controls,
// mobile layout) lives in AudioPlayerView.test.tsx against the presentational
// component directly. These tests only prove the container wires the global
// player store to AudioPlayerView correctly.

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
  cover_art_thumb_path: null,
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

it('renders nothing when there is no episode in the store', () => {
  const { container } = render(<AudioPlayer />)
  expect(container.firstChild).toBeNull()
})

it('renders the store episode title when one is set', () => {
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(screen.getByText('Test Episode')).toBeInTheDocument()
})

it('clicking play updates the store', () => {
  usePlayerStore.setState({ episode: mockEpisode, playing: false })
  render(<AudioPlayer />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(usePlayerStore.getState().playing).toBe(true)
})

it('clicking the speed toggle updates the store', () => {
  usePlayerStore.setState({ episode: mockEpisode, speed: 1 })
  render(<AudioPlayer />)
  fireEvent.click(screen.getByRole('button', { name: /speed/i }))
  expect(usePlayerStore.getState().speed).toBe(1.5)
})

it('sets the --player-h CSS variable when an episode is present', () => {
  // jsdom doesn't compute real layout (offsetHeight is always 0), so this
  // only proves the wiring fires — the actual measured value is covered
  // by AudioPlayerView.test.tsx's onHeightChange spy.
  usePlayerStore.setState({ episode: mockEpisode })
  render(<AudioPlayer />)
  expect(document.documentElement.style.getPropertyValue('--player-h')).not.toBe('')
})

it('resets the --player-h CSS variable when there is no episode', () => {
  usePlayerStore.setState({ episode: null })
  render(<AudioPlayer />)
  expect(document.documentElement.style.getPropertyValue('--player-h')).toBe('0px')
})
