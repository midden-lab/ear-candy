import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, beforeEach, describe } from 'vitest'
import { usePlayerStore } from '../store/playerStore'
import AudioPlayer from '../components/AudioPlayer'
import { getEpisodeProgress } from '../utils/episodeProgress'
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

  // The periodic save fires on any timeUpdate crossing 5s of movement from
  // the last-persisted value — including the very first tick, since it
  // starts at 0. To actually isolate the *eager* save (not just observe the
  // periodic one that would happen anyway), each test below first "uses up"
  // the periodic save with an initial tick, then moves the position again by
  // less than 5s (so the periodic path stays silent) before triggering the
  // event under test — only the eager path can be responsible for the final
  // persisted value differing from the first tick's (issue #85).
  describe('eager save on disconnect/tab-close', () => {
    function setAudioTime(seconds: number) {
      const audio = document.querySelector('audio')!
      Object.defineProperty(audio, 'currentTime', { value: seconds, configurable: true })
      fireEvent.timeUpdate(audio)
    }

    // Reading localStorage directly (rather than unmounting and remounting
    // to observe the resumed value) avoids a confound: unmounting always
    // re-persists the latest position via the pre-existing switch-away
    // cleanup, which would mask whether the eager-save path under test here
    // actually did anything.
    it('persists immediately when the tab becomes hidden', () => {
      usePlayerStore.setState({ episode: mockEpisode, playing: true })
      render(<AudioPlayer />)
      setAudioTime(20) // periodic tick persists 20
      setAudioTime(22) // +2, below the periodic threshold — not yet persisted

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      act(() => document.dispatchEvent(new Event('visibilitychange')))

      expect(getEpisodeProgress(mockEpisode.id)).toBe(22)
    })

    it('does not eagerly persist when the tab becomes visible again', () => {
      usePlayerStore.setState({ episode: mockEpisode, playing: true })
      render(<AudioPlayer />)
      setAudioTime(20) // periodic tick persists 20
      setAudioTime(22) // +2, below the periodic threshold — not yet persisted

      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      act(() => document.dispatchEvent(new Event('visibilitychange')))

      // Only the periodic tick's value (20) should have been persisted —
      // a 'visible' transition must not trigger the eager-save path.
      expect(getEpisodeProgress(mockEpisode.id)).toBe(20)
    })

    it('persists immediately on pagehide', () => {
      usePlayerStore.setState({ episode: mockEpisode, playing: true })
      render(<AudioPlayer />)
      setAudioTime(20)
      setAudioTime(22)

      act(() => window.dispatchEvent(new Event('pagehide')))

      expect(getEpisodeProgress(mockEpisode.id)).toBe(22)
    })

    it('persists immediately when the browser goes offline', () => {
      usePlayerStore.setState({ episode: mockEpisode, playing: true })
      render(<AudioPlayer />)
      setAudioTime(20)
      setAudioTime(22)

      act(() => window.dispatchEvent(new Event('offline')))

      expect(getEpisodeProgress(mockEpisode.id)).toBe(22)
    })

    it('does not persist on hide once the episode has already ended', () => {
      usePlayerStore.setState({ episode: mockEpisode, playing: true })
      render(<AudioPlayer />)
      setAudioTime(90)
      act(() => fireEvent.ended(document.querySelector('audio')!))

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      act(() => document.dispatchEvent(new Event('visibilitychange')))

      expect(getEpisodeProgress(mockEpisode.id)).toBeUndefined()
    })
  })
})

describe('shared-link start time', () => {
  it('resumes at the shared timestamp when there is no locally-saved progress', () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: false })
    render(<AudioPlayer sharedStart={{ episodeId: 1, time: 75 }} />)
    expect(usePlayerStore.getState().currentTime).toBe(75)
  })

  it('ignores the shared timestamp when it is for a different episode', () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: false })
    render(<AudioPlayer sharedStart={{ episodeId: 999, time: 75 }} />)
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })

  it("prefers the listener's own saved progress over the shared timestamp once it exists", () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: true })
    const { unmount } = render(<AudioPlayer sharedStart={{ episodeId: 1, time: 75 }} />)

    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'currentTime', { value: 200, configurable: true })
    fireEvent.timeUpdate(audio)
    unmount()

    // Second activation of the same episode within the session: the
    // listener's own more-recent progress (200s) wins over the original
    // shared moment (75s).
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer sharedStart={{ episodeId: 1, time: 75 }} />)
    expect(usePlayerStore.getState().currentTime).toBe(200)
  })

  it('re-applies the shared timestamp if re-visiting the same shared link after the episode finished (issue #56)', () => {
    usePlayerStore.setState({ episode: mockEpisode, playing: true })
    const { unmount } = render(<AudioPlayer sharedStart={{ episodeId: 1, time: 75 }} />)

    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'currentTime', { value: 118, configurable: true })
    fireEvent.timeUpdate(audio)
    fireEvent.ended(audio)
    unmount()

    // `ended` cleared the saved progress — re-opening the same shared link
    // (same sharedStart prop, e.g. the listener followed it again from a
    // chat/social post) should honor the shared timestamp again, rather
    // than silently resuming at 0 with no explanation.
    usePlayerStore.setState({ episode: mockEpisode })
    render(<AudioPlayer sharedStart={{ episodeId: 1, time: 75 }} />)
    expect(usePlayerStore.getState().currentTime).toBe(75)
  })
})
