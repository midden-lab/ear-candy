import { usePlayerStore } from '../store/playerStore'
import AudioPlayerView from './AudioPlayerView'

/**
 * Connects AudioPlayerView to this app's global player store. Kept
 * deliberately thin — all real player behavior lives in AudioPlayerView,
 * which takes no dependency on this app's state management.
 */
export default function AudioPlayer() {
  const { episode, playing, currentTime, duration, speed, setPlaying, setCurrentTime, setDuration, setSpeed } =
    usePlayerStore()

  return (
    <AudioPlayerView
      episode={episode}
      playing={playing}
      currentTime={currentTime}
      duration={duration}
      speed={speed}
      onSeek={setCurrentTime}
      onTogglePlay={() => setPlaying(!playing)}
      onSpeedChange={setSpeed}
      onTimeUpdate={setCurrentTime}
      onDurationChange={setDuration}
      onEnded={() => setPlaying(false)}
      onHeightChange={px => document.documentElement.style.setProperty('--player-h', `${px}px`)}
    />
  )
}
