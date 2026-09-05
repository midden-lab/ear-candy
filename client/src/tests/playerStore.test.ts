import { act } from '@testing-library/react'
import { usePlayerStore } from '../store/playerStore'
import type { Episode } from '../types'

const mockEpisode: Episode = {
  id: 1,
  season_id: 1,
  number: 1,
  title: 'Test Episode',
  description: 'A test episode',
  guests: '',
  tags: '',
  cover_art_path: null,
  cover_art_thumb_path: null,
  duration_seconds: 3600,
  publish_date: '2024-01-01',
  audio_type: 'upload',
  audio_path: '/audio/ep1.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockEpisode2: Episode = {
  ...mockEpisode,
  id: 2,
  title: 'Second Episode',
}

beforeEach(() => {
  usePlayerStore.setState({
    episode: null, playing: false, currentTime: 0, duration: 0, speed: 1,
    loading: false, error: false, retryNonce: 0, seekRequest: null,
  })
})

describe('playerStore', () => {
  it('has correct initial state', () => {
    const state = usePlayerStore.getState()
    expect(state.episode).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.currentTime).toBe(0)
    expect(state.duration).toBe(0)
    expect(state.seekRequest).toBeNull()
  })

  it('setEpisode sets the episode', () => {
    act(() => {
      usePlayerStore.getState().setEpisode(mockEpisode)
    })
    expect(usePlayerStore.getState().episode).toEqual(mockEpisode)
  })

  it('setEpisode replaces a previously set episode', () => {
    act(() => {
      usePlayerStore.getState().setEpisode(mockEpisode)
    })
    act(() => {
      usePlayerStore.getState().setEpisode(mockEpisode2)
    })
    expect(usePlayerStore.getState().episode).toEqual(mockEpisode2)
    expect(usePlayerStore.getState().episode?.id).toBe(2)
  })

  it('setPlaying sets playing to true', () => {
    act(() => {
      usePlayerStore.getState().setPlaying(true)
    })
    expect(usePlayerStore.getState().playing).toBe(true)
  })

  it('setPlaying sets playing to false', () => {
    act(() => {
      usePlayerStore.getState().setPlaying(true)
    })
    act(() => {
      usePlayerStore.getState().setPlaying(false)
    })
    expect(usePlayerStore.getState().playing).toBe(false)
  })

  it('setCurrentTime updates currentTime', () => {
    act(() => {
      usePlayerStore.getState().setCurrentTime(42.5)
    })
    expect(usePlayerStore.getState().currentTime).toBe(42.5)
  })

  it('setDuration updates duration', () => {
    act(() => {
      usePlayerStore.getState().setDuration(3600)
    })
    expect(usePlayerStore.getState().duration).toBe(3600)
  })

  it('has default speed of 1', () => {
    expect(usePlayerStore.getState().speed).toBe(1)
  })

  it('setSpeed updates speed', () => {
    usePlayerStore.getState().setSpeed(1.5)
    expect(usePlayerStore.getState().speed).toBe(1.5)
  })

  describe('loading/error/retry state (issues #82, #83)', () => {
    it('has loading/error false and retryNonce 0 by default', () => {
      const state = usePlayerStore.getState()
      expect(state.loading).toBe(false)
      expect(state.error).toBe(false)
      expect(state.retryNonce).toBe(0)
    })

    it('setLoading toggles loading independently of other state', () => {
      act(() => usePlayerStore.getState().setLoading(true))
      expect(usePlayerStore.getState().loading).toBe(true)
      act(() => usePlayerStore.getState().setLoading(false))
      expect(usePlayerStore.getState().loading).toBe(false)
    })

    it('setError toggles error independently of other state', () => {
      act(() => usePlayerStore.getState().setError(true))
      expect(usePlayerStore.getState().error).toBe(true)
    })

    it('setPlaying(false) clears a stale loading flag — pausing cancels the pending play attempt', () => {
      act(() => {
        usePlayerStore.getState().setPlaying(true)
        usePlayerStore.getState().setLoading(true)
      })
      act(() => usePlayerStore.getState().setPlaying(false))
      expect(usePlayerStore.getState().loading).toBe(false)
      expect(usePlayerStore.getState().playing).toBe(false)
    })

    it('setPlaying(true) does not touch loading', () => {
      act(() => usePlayerStore.getState().setLoading(true))
      act(() => usePlayerStore.getState().setPlaying(true))
      expect(usePlayerStore.getState().loading).toBe(true)
    })

    it('retryPlayback increments retryNonce, clears error, and sets loading', () => {
      act(() => usePlayerStore.getState().setError(true))
      act(() => usePlayerStore.getState().retryPlayback())
      const state = usePlayerStore.getState()
      expect(state.retryNonce).toBe(1)
      expect(state.error).toBe(false)
      expect(state.loading).toBe(true)
    })

    it('retryPlayback increments retryNonce on every call', () => {
      act(() => usePlayerStore.getState().retryPlayback())
      act(() => usePlayerStore.getState().retryPlayback())
      expect(usePlayerStore.getState().retryNonce).toBe(2)
    })
  })

  describe('requestSeek', () => {
    it('sets seekRequest with the requested time and a nonce of 1 on first call', () => {
      act(() => usePlayerStore.getState().requestSeek(42))
      expect(usePlayerStore.getState().seekRequest).toEqual({ time: 42, nonce: 1 })
    })

    it('increments the nonce on every subsequent call, even to the same time', () => {
      act(() => usePlayerStore.getState().requestSeek(10))
      act(() => usePlayerStore.getState().requestSeek(10))
      act(() => usePlayerStore.getState().requestSeek(20))
      expect(usePlayerStore.getState().seekRequest).toEqual({ time: 20, nonce: 3 })
    })

    it('does not itself change currentTime — that only happens once AudioPlayerView applies the seek and calls onSeek', () => {
      act(() => usePlayerStore.getState().requestSeek(99))
      expect(usePlayerStore.getState().currentTime).toBe(0)
    })
  })
})
