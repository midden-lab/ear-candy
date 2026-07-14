import { beforeEach, describe, it, expect } from 'vitest'
import { getEpisodeProgress, saveEpisodeProgress, clearEpisodeProgress } from '../utils/episodeProgress'

describe('episodeProgress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns undefined for an episode with no saved progress', () => {
    expect(getEpisodeProgress(1)).toBeUndefined()
  })

  it('round-trips a saved position', () => {
    saveEpisodeProgress(1, 123)
    expect(getEpisodeProgress(1)).toBe(123)
  })

  it('keeps positions for different episodes independent', () => {
    saveEpisodeProgress(1, 30)
    saveEpisodeProgress(2, 90)
    expect(getEpisodeProgress(1)).toBe(30)
    expect(getEpisodeProgress(2)).toBe(90)
  })

  it('does not persist near-zero progress', () => {
    saveEpisodeProgress(1, 2)
    expect(getEpisodeProgress(1)).toBeUndefined()
  })

  it('clears a previously-saved position', () => {
    saveEpisodeProgress(1, 30)
    clearEpisodeProgress(1)
    expect(getEpisodeProgress(1)).toBeUndefined()
  })

  it('overwrites an existing saved position with a newer one', () => {
    saveEpisodeProgress(1, 30)
    saveEpisodeProgress(1, 60)
    expect(getEpisodeProgress(1)).toBe(60)
  })

  it('saving a near-zero position clears any previously-saved one', () => {
    saveEpisodeProgress(1, 60)
    saveEpisodeProgress(1, 1)
    expect(getEpisodeProgress(1)).toBeUndefined()
  })

  it('evicts the oldest entries once the cap is exceeded', () => {
    for (let id = 1; id <= 51; id++) {
      saveEpisodeProgress(id, 10 + id)
    }
    expect(getEpisodeProgress(1)).toBeUndefined()
    expect(getEpisodeProgress(51)).toBe(61)
  })
})
