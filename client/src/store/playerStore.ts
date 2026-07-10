import { create } from 'zustand'
import type { Episode } from '../types'

interface PlayerState {
  episode: Episode | null
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  setEpisode: (ep: Episode) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  setSpeed: (speed: number) => void
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  episode: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  speed: 1,
  setEpisode: (ep) => set({ episode: ep }),
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setSpeed: (speed) => set({ speed }),
}))
