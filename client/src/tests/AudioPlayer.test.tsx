import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, beforeEach, describe } from 'vitest'
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

const otherEpisode: Episode = { ...mockEpisode, id: 2, title: 'Other Episode' }

beforeEach(() => {
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 120, speed: 1 })
  vi.clearAllMocks()
  localStorage.clear()
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

describe('per-episode resume position', () => {
  it('saves progress on switching away from an episode and restores it later', () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: true })
    const { rerender, unmount } = render(<AudioPlayer />)

    fireEvent.timeUpdate(document.querySelector('audio')!, {
      target: { currentTime: 42 },
    })
    // AudioPlayerView reads audioRef.current.currentTime directly rather than
    // the event target, so drive the real element's value too.
    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'currentTime', { value: 42, configurable: true })
    fireEvent.timeUpdate(audio)

    expect(usePlayerStore.getState().currentTime).toBe(42)

    // Switch to a different episode — the outgoing episode's position
    // (episode 1 @ 42s) should be persisted via the cleanup path.
    act(() => usePlayerStore.setState({ episode: otherEpisode }))
    rerender(<AudioPlayer />)
    unmount()

    // A fresh mount for the original episode should immediately resume at 42s.
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    expect(usePlayerStore.getState().currentTime).toBe(42)
  })

  it('does not persist trivial near-start progress', () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: true })
    const { unmount } = render(<AudioPlayer />)

    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'currentTime', { value: 2, configurable: true })
    fireEvent.timeUpdate(audio)
    unmount()

    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })

  it('clears saved progress once an episode finishes', () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: true })
    const { unmount } = render(<AudioPlayer />)

    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'currentTime', { value: 90, configurable: true })
    fireEvent.timeUpdate(audio)
    fireEvent.ended(audio)
    unmount()

    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer />)
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })
})
