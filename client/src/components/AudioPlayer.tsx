import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import ProgressBar from './ProgressBar'

function formatTime(seconds: number, showSign = false): string {
  const abs = Math.floor(Math.abs(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  const str = `${m}:${String(s).padStart(2, '0')}`
  return showSign && seconds < 0 ? `-${str}` : str
}

const SPEEDS = [1, 1.5, 2] as const

export default function AudioPlayer() {
  const { episode, playing, currentTime, duration, speed, setPlaying, setCurrentTime, setDuration, setSpeed } =
    usePlayerStore()
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !episode) return
    audio.src = episode.audio_path
    audio.load()
  }, [episode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) void audio.play()
    else audio.pause()
  }, [playing])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  const handleSeek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const skipTo = (time: number) => {
    handleSeek(Math.max(0, Math.min(time, duration)))
  }

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as typeof SPEEDS[number])
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length])
  }

  if (!episode) return null

  const remaining = currentTime - duration

  return (
    <div data-testid="player-bar" className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900 px-6 py-3">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className="mx-auto max-w-3xl space-y-2">
        <div className="truncate text-sm font-medium text-zinc-100">{episode.title}</div>
        <ProgressBar currentTime={currentTime} duration={duration} onSeek={handleSeek} />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(remaining, true)}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => skipTo(0)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Skip to start"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>
          <button
            onClick={() => skipTo(currentTime - 15)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Back 15 seconds"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8.01-8z"/>
            </svg>
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className="rounded-full bg-[var(--accent)] p-3 text-white transition-opacity hover:opacity-90"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => skipTo(currentTime + 15)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Forward 15 seconds"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
            </svg>
          </button>
          <button
            onClick={() => skipTo(duration)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Skip to end"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z"/>
            </svg>
          </button>
          <button
            onClick={cycleSpeed}
            className="rounded px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors min-w-[2.5rem] text-center"
            aria-label="Playback speed"
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  )
}
