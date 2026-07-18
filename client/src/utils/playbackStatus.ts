import type { Episode } from '../types'

export interface PlaybackStatus {
  text: string
  tone: 'neutral' | 'error'
}

/**
 * Computes the buffering/error status line shown near playback controls, or
 * null when nothing should be shown. Centralized so the message text
 * (including the CORS-aware hint for external-URL episodes, issue #84)
 * stays identical everywhere it's surfaced — the player bar, the mobile
 * full-screen overlay, and DetailPane's own controls.
 */
export function getPlaybackStatus(
  episode: Pick<Episode, 'audio_type'> | null | undefined,
  { loading, error }: { loading?: boolean; error?: boolean }
): PlaybackStatus | null {
  if (error) {
    return {
      tone: 'error',
      text: episode?.audio_type === 'url'
        ? 'Playback interrupted — the source may be unreachable or blocking playback here. Tap retry.'
        : 'Playback interrupted — tap retry.',
    }
  }
  if (loading) {
    return { tone: 'neutral', text: 'Buffering…' }
  }
  return null
}
