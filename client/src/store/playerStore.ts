import { create } from 'zustand'
import type { Episode } from '../types'

interface PlayerState {
  episode: Episode | null
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  /** True while the browser is buffering and can't yet fulfil a play()
   *  attempt (native `waiting`/`stalled` audio events) — distinct from
   *  `error`, which means the attempt actually failed rather than just
   *  being slow (issue #82). */
  loading: boolean
  /** True after a real playback failure (native `error` event) — cleared by
   *  a successful retry or by loading a different episode (issue #83). */
  error: boolean
  /** Bumped by retryPlayback() so any button (player bar, mini-bar,
   *  full-screen overlay, DetailPane) can trigger the same retry regardless
   *  of which component actually owns the <audio> element — only
   *  AudioPlayerView holds that ref, so a plain state flag it can react to
   *  in an effect is simpler than plumbing an imperative retry function
   *  through every caller. */
  retryNonce: number
  /** Set by requestSeek() below when something outside AudioPlayerView
   *  needs to move playback (e.g. DetailPane's own scrub bar, which has no
   *  <audio> ref of its own) — only AudioPlayerView can actually apply a
   *  seek to the real element, so this is a request for it to react to via
   *  its own effect, not a substitute for setCurrentTime (which only
   *  updates the displayed value, same reasoning as retryNonce above). */
  seekRequest: { time: number; nonce: number } | null
  setEpisode: (ep: Episode) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  setSpeed: (speed: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: boolean) => void
  retryPlayback: () => void
  requestSeek: (time: number) => void
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  episode: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  speed: 1,
  loading: false,
  error: false,
  retryNonce: 0,
  seekRequest: null,
  setEpisode: (ep) => set({ episode: ep }),
  // Pausing cancels whatever the browser was doing to fulfil a pending
  // play() attempt, so a stale "buffering" indicator should clear with it —
  // otherwise a listener who taps pause mid-buffer keeps seeing a loading
  // state for an attempt that's no longer happening.
  setPlaying: (playing) => set(playing ? { playing } : { playing, loading: false }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setSpeed: (speed) => set({ speed }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  retryPlayback: () => set(state => ({ retryNonce: state.retryNonce + 1, error: false, loading: true })),
  requestSeek: (time) => set(state => ({ seekRequest: { time, nonce: (state.seekRequest?.nonce ?? 0) + 1 } })),
}))
