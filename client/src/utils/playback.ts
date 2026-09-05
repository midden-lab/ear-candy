export const SPEEDS = [1, 1.5, 2] as const

export function formatTime(seconds: number, showSign = false): string {
  const abs = Math.floor(Math.abs(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  const str = `${m}:${String(s).padStart(2, '0')}`
  return showSign && seconds < 0 ? `-${str}` : str
}

/** Clamps a seek target to a valid range for the given duration — shared
 *  by AudioPlayerView (its own scrub bar) and DetailPane (via
 *  playerStore's requestSeek) so both compute the same clamp the same way. */
export function clampSeekTime(time: number, duration: number): number {
  return Math.max(0, Math.min(time, duration))
}

/** The next speed in the cycle after `current`, wrapping back to the start. */
export function nextSpeed(current: number): number {
  const idx = SPEEDS.indexOf(current as typeof SPEEDS[number])
  return SPEEDS[(idx + 1) % SPEEDS.length]
}
