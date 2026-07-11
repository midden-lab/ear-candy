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
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 0, speed: 1 })
})

describe('playerStore', () => {
  it('has correct initial state', () => {
    const state = usePlayerStore.getState()
    expect(state.episode).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.currentTime).toBe(0)
    expect(state.duration).toBe(0)
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
})
