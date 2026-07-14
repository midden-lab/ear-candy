import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import AudioPlayerView from './AudioPlayerView'
import { getEpisodeProgress, saveEpisodeProgress, clearEpisodeProgress } from '../utils/episodeProgress'

/**
 * Connects AudioPlayerView to this app's global player store. Kept
 * deliberately thin — all real player behavior lives in AudioPlayerView,
 * which takes no dependency on this app's state management. The one bit of
 * app-specific behavior added here is per-episode resume: saving/reading
 * playback position by episode id via `utils/episodeProgress`.
 */
export default function AudioPlayer() {
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

  // On entering an episode, sync the store's displayed time to its saved
  // resume position immediately (rather than waiting for the first native
  // `timeupdate` event). On leaving it (episode changes again, or this
  // component unmounts), persist wherever playback actually was.
  useEffect(() => {
    const id = episode?.id
    endedRef.current = false
    if (id !== undefined) {
      setCurrentTime(getEpisodeProgress(id) ?? 0)
    }
    return () => {
      if (id !== undefined && !endedRef.current) saveEpisodeProgress(id, currentTimeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      resumeTime={episode ? getEpisodeProgress(episode.id) : undefined}
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
