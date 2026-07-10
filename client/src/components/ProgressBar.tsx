interface ProgressBarProps {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

export default function ProgressBar({ currentTime, duration, onSeek }: ProgressBarProps) {
  return (
    <div className="w-full">
      <input
        type="range"
        min={0}
        max={duration || 1}
        value={currentTime}
        step={1}
        onChange={e => onSeek(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
        aria-label="Seek"
      />
    </div>
  )
}
