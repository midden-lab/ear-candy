import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import AudioPlayerView from './AudioPlayerView'
import { getEpisodeProgress, saveEpisodeProgress, clearEpisodeProgress } from '../utils/episodeProgress'

export interface SharedStart {
  episodeId: number
  time: number
}

interface AudioPlayerProps {
  /** A timestamp from a shared deep link (`?episode=X&t=Y`), tied to the
   *  specific episode id it was shared for. Only used as a resume position
   *  when there's no locally-saved progress for that episode yet — the
   *  listener's own more-recent progress always wins once it exists, so a
   *  shared moment naturally stops applying after the first listen rather
   *  than needing an explicit "already consumed" flag. */
  sharedStart?: SharedStart
}

/**
 * Connects AudioPlayerView to this app's global player store. Kept
 * deliberately thin — all real player behavior lives in AudioPlayerView,
 * which takes no dependency on this app's state management. The bits of
 * app-specific behavior added here are per-episode resume (saving/reading
 * playback position by episode id via `utils/episodeProgress`) and applying
 * a one-time shared-link start time when present.
 */
export default function AudioPlayer({ sharedStart }: AudioPlayerProps) {
  const { episode, playing, currentTime, duration, speed, setPlaying, setCurrentTime, setDuration, setSpeed } =
    usePlayerStore()

  // Kept fresh on every timeUpdate so the effect below can read "the last
  // known position" from its cleanup without depending on currentTime
  // (which would otherwise re-run the effect on every tick).
  const currentTimeRef = useRef(currentTime)
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  // Set when an episode finishes, so the switch-away cleanup below doesn't
  // immediately re-persist a position that was just deliberately cleared.
  const endedRef = useRef(false)

  // No locally-saved progress yet + this is the episode a shared link
  // pointed at -> use the shared timestamp. Otherwise prefer the listener's
  // own saved position. Reads only props and localStorage (no refs/state),
  // so it's safe to call during render as well as inside the effect below.
  function resumeTimeFor(episodeId: number): number | undefined {
    const saved = getEpisodeProgress(episodeId)
    if (saved !== undefined) return saved
    if (sharedStart?.episodeId === episodeId) return sharedStart.time
    return undefined
  }

  // On entering an episode, sync the store's displayed time to its resume
  // position immediately (rather than waiting for the first native
  // `timeupdate` event). On leaving it (episode changes again, or this
  // component unmounts), persist wherever playback actually was.
  useEffect(() => {
    const id = episode?.id
    endedRef.current = false
    if (id !== undefined) {
      setCurrentTime(resumeTimeFor(id) ?? 0)
    }
    return () => {
      if (id !== undefined && !endedRef.current) saveEpisodeProgress(id, currentTimeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id])

  // The periodic save below only fires every 5s of playback progress, so a
  // real disconnect or a closed/backgrounded tab could lose up to that much
  // resume position. Persisting eagerly on these events closes that gap
  // without changing the periodic tick itself or anything about how a saved
  // position is later used (issue #85).
  useEffect(() => {
    const id = episode?.id
    if (id === undefined) return

    function persistIfNotEnded() {
      if (!endedRef.current) saveEpisodeProgress(id!, currentTimeRef.current)
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') persistIfNotEnded()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', persistIfNotEnded)
    window.addEventListener('offline', persistIfNotEnded)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', persistIfNotEnded)
      window.removeEventListener('offline', persistIfNotEnded)
    }
  }, [episode?.id])

  const lastPersistedRef = useRef(0)
  const handleTimeUpdate = (t: number) => {
    setCurrentTime(t)
    if (episode && Math.abs(t - lastPersistedRef.current) >= 5) {
      saveEpisodeProgress(episode.id, t)
      lastPersistedRef.current = t
    }
  }

  const handleEnded = () => {
    setPlaying(false)
    if (episode) {
      endedRef.current = true
      clearEpisodeProgress(episode.id)
    }
  }

  return (
    <AudioPlayerView
      episode={episode}
      playing={playing}
      currentTime={currentTime}
      duration={duration}
      speed={speed}
      resumeTime={episode ? resumeTimeFor(episode.id) : undefined}
      onSeek={setCurrentTime}
      onTogglePlay={() => setPlaying(!playing)}
      onSpeedChange={setSpeed}
      onTimeUpdate={handleTimeUpdate}
      onDurationChange={setDuration}
      onEnded={handleEnded}
      onHeightChange={px => document.documentElement.style.setProperty('--player-h', `${px}px`)}
    />
  )
}
