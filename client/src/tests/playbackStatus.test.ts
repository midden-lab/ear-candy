import { describe, it, expect } from 'vitest'
import { getPlaybackStatus } from '../utils/playbackStatus'

describe('getPlaybackStatus', () => {
  it('returns null when neither loading nor error', () => {
    expect(getPlaybackStatus({ audio_type: 'upload' }, {})).toBeNull()
  })

  it('returns a neutral Buffering… status when loading', () => {
    expect(getPlaybackStatus({ audio_type: 'upload' }, { loading: true })).toEqual({
      tone: 'neutral', text: 'Buffering…',
    })
  })

  it('returns an error status for an upload-type episode', () => {
    expect(getPlaybackStatus({ audio_type: 'upload' }, { error: true })).toEqual({
      tone: 'error', text: 'Playback interrupted — tap retry.',
    })
  })

  it('returns a CORS-aware error status for a url-type episode', () => {
    const status = getPlaybackStatus({ audio_type: 'url' }, { error: true })
    expect(status?.tone).toBe('error')
    expect(status?.text).toMatch(/may be unreachable or blocking playback/)
  })

  it('error takes precedence over loading', () => {
    const status = getPlaybackStatus({ audio_type: 'upload' }, { loading: true, error: true })
    expect(status?.tone).toBe('error')
  })

  it('handles a null/undefined episode without throwing', () => {
    expect(getPlaybackStatus(null, { error: true })?.tone).toBe('error')
    expect(getPlaybackStatus(undefined, { loading: true })?.tone).toBe('neutral')
  })
})
