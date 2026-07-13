import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, afterEach, describe } from 'vitest'
import AudioPlayerView from '../components/AudioPlayerView'
import type { AudioPlayerViewProps } from '../components/AudioPlayerView'
import type { Episode } from '../types'

HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLMediaElement.prototype.pause = vi.fn()
HTMLMediaElement.prototype.load = vi.fn()

const originalMatchMedia = window.matchMedia

function mockMobile() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const mockEpisode: Episode = {
  id: 1,
  season_id: 1,
  number: 1,
  title: 'Test Episode',
  description: 'A test episode',
  guests: 'Alice, Bob',
  tags: 'tech,news',
  cover_art_path: null,
  cover_art_thumb_path: null,
  duration_seconds: 120,
  publish_date: '2024-01-01',
  audio_type: 'url',
  audio_path: 'https://example.com/episode.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

type Overrides = Partial<Pick<AudioPlayerViewProps, 'episode' | 'playing' | 'currentTime' | 'duration' | 'speed'>>

/** Stateful harness so callback-driven interactions (play/pause, seek, speed)
 *  actually update what's rendered — proves this is a genuine controlled
 *  component, not just a prop-in/callback-out shell. */
function Harness(overrides: Overrides) {
  const [episode] = useState<Episode | null>(overrides.episode ?? null)
  const [playing, setPlaying] = useState(overrides.playing ?? false)
  const [currentTime, setCurrentTime] = useState(overrides.currentTime ?? 0)
  const [duration] = useState(overrides.duration ?? 120)
  const [speed, setSpeed] = useState(overrides.speed ?? 1)

  return (
    <AudioPlayerView
      episode={episode}
      playing={playing}
      currentTime={currentTime}
      duration={duration}
      speed={speed}
      onSeek={setCurrentTime}
      onTogglePlay={() => setPlaying(p => !p)}
      onSpeedChange={setSpeed}
      onTimeUpdate={setCurrentTime}
      onDurationChange={() => {}}
      onEnded={() => setPlaying(false)}
    />
  )
}

function renderView(overrides: Overrides = {}) {
  return render(<Harness {...overrides} />)
}

it('renders nothing when there is no episode', () => {
  const { container } = renderView({ episode: null })
  expect(container.firstChild).toBeNull()
})

it('renders episode title and play button when an episode is given', () => {
  renderView({ episode: mockEpisode })
  expect(screen.getByText('Test Episode')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
})

it('shows pause button when playing is true', () => {
  renderView({ episode: mockEpisode, playing: true })
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
})

it('desktop mini-bar shows a lazy-loaded thumbnail when cover art is set', () => {
  renderView({
    episode: { ...mockEpisode, cover_art_path: 'https://example.com/detail.webp', cover_art_thumb_path: 'https://example.com/thumb.webp' },
  })
  const img = screen.getByRole('img')
  expect(img).toHaveAttribute('src', 'https://example.com/thumb.webp')
  expect(img).toHaveAttribute('loading', 'lazy')
  // Mini-bar only ever needs the small thumbnail — never the larger detail asset.
  expect(img).not.toHaveAttribute('srcset')
})

it('desktop mini-bar renders no image when there is no cover art', () => {
  renderView({ episode: mockEpisode })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('clicking play calls onTogglePlay, flipping the controlled playing state', () => {
  renderView({ episode: mockEpisode, playing: false })
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
})

it('renders all transport buttons', () => {
  renderView({ episode: mockEpisode })
  expect(screen.getByRole('button', { name: 'Skip to start' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Skip to end' })).toBeInTheDocument()
})

it('renders speed toggle showing current speed', () => {
  renderView({ episode: mockEpisode, speed: 1 })
  expect(screen.getByRole('button', { name: /speed/i })).toHaveTextContent('1×')
})

it('clicking speed toggle cycles 1→1.5→2→1 via onSpeedChange', () => {
  renderView({ episode: mockEpisode, speed: 1 })
  const btn = screen.getByRole('button', { name: /speed/i })
  fireEvent.click(btn)
  expect(btn).toHaveTextContent('1.5×')
  fireEvent.click(btn)
  expect(btn).toHaveTextContent('2×')
  fireEvent.click(btn)
  expect(btn).toHaveTextContent('1×')
})

it('displays elapsed and remaining timestamps', () => {
  renderView({ episode: mockEpisode, currentTime: 65, duration: 120 })
  expect(screen.getByText('1:05')).toBeInTheDocument()
  expect(screen.getByText('-0:55')).toBeInTheDocument()
})

it('reports its rendered height via onHeightChange', () => {
  const onHeightChange = vi.fn()
  render(
    <AudioPlayerView
      episode={mockEpisode}
      playing={false}
      currentTime={0}
      duration={120}
      speed={1}
      onSeek={() => {}}
      onTogglePlay={() => {}}
      onSpeedChange={() => {}}
      onTimeUpdate={() => {}}
      onDurationChange={() => {}}
      onEnded={() => {}}
      onHeightChange={onHeightChange}
    />
  )
  expect(onHeightChange).toHaveBeenCalled()
  expect(typeof onHeightChange.mock.calls[0][0]).toBe('number')
})

describe('switching episodes mid-playback (regression)', () => {
  const secondEpisode: Episode = {
    ...mockEpisode,
    id: 2,
    title: 'Second Episode',
    audio_path: 'https://example.com/second.mp3',
  }

  // The play/pause/load mocks are module-level (assigned once at the top of
  // this file) and never reset between tests in this suite, so assertions
  // here use call-count deltas rather than absolute counts — robust
  // regardless of how many prior tests in the file already touched them.
  function callCount(fn: unknown): number {
    return (fn as ReturnType<typeof vi.fn>).mock.calls.length
  }

  it('calls play() again when switching to a new episode while already playing', () => {
    const playCallsBeforeMount = callCount(HTMLMediaElement.prototype.play)
    const { rerender } = render(
      <AudioPlayerView
        episode={mockEpisode}
        playing={true}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    // On initial mount with playing already true, both the [episode] effect
    // (now conditionally calling play(), per this fix) and the pre-existing
    // [playing] effect fire together and each call play() once — a harmless,
    // idempotent double-call (browsers no-op a second play() on media that's
    // already playing/pending), not the bug under test. Just assert mounting
    // triggered play() at all; the real regression check is the switch below.
    expect(callCount(HTMLMediaElement.prototype.play)).toBeGreaterThan(playCallsBeforeMount)

    // `playing` stays `true` across this rerender — the exact scenario from
    // the reported bug (UI shows "playing", but the underlying <audio>
    // element never actually got a fresh play() call for the new source).
    const playCallsBeforeSwitch = callCount(HTMLMediaElement.prototype.play)
    rerender(
      <AudioPlayerView
        episode={secondEpisode}
        playing={true}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(callCount(HTMLMediaElement.prototype.play)).toBe(playCallsBeforeSwitch + 1)
  })

  it('does not reload the element on a plain pause/resume toggle (position-preservation guard)', () => {
    const loadCallsBeforeMount = callCount(HTMLMediaElement.prototype.load)
    const { rerender } = render(
      <AudioPlayerView
        episode={mockEpisode}
        playing={true}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(callCount(HTMLMediaElement.prototype.load)).toBe(loadCallsBeforeMount + 1)

    const loadCallsBeforeToggling = callCount(HTMLMediaElement.prototype.load)
    rerender(
      <AudioPlayerView
        episode={mockEpisode}
        playing={false}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    rerender(
      <AudioPlayerView
        episode={mockEpisode}
        playing={true}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    // Same episode throughout — the [episode] effect (and its load() call)
    // must not fire again just because `playing` toggled.
    expect(callCount(HTMLMediaElement.prototype.load)).toBe(loadCallsBeforeToggling)
  })

  it('does not autoplay when switching episodes while playing is false', () => {
    const playCallsBeforeMount = callCount(HTMLMediaElement.prototype.play)
    const { rerender } = render(
      <AudioPlayerView
        episode={mockEpisode}
        playing={false}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(callCount(HTMLMediaElement.prototype.play)).toBe(playCallsBeforeMount)

    rerender(
      <AudioPlayerView
        episode={secondEpisode}
        playing={false}
        currentTime={0}
        duration={120}
        speed={1}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(callCount(HTMLMediaElement.prototype.play)).toBe(playCallsBeforeMount)
  })
})

describe('mobile (< md)', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('renders a compact mini-bar by default, not the full transport controls', () => {
    mockMobile()
    renderView({ episode: mockEpisode })
    expect(screen.getByText('Test Episode')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip to start' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /speed/i })).not.toBeInTheDocument()
  })

  it('title truncates correctly next to the play button (min-w-0 regression guard)', () => {
    mockMobile()
    renderView({ episode: mockEpisode })
    const title = screen.getByText('Test Episode')
    expect(title).toHaveClass('truncate')
    expect(title.parentElement).toHaveClass('min-w-0')
  })

  it('tapping the mini-bar expands to the full-screen overlay with all transport controls', async () => {
    const user = userEvent.setup()
    mockMobile()
    renderView({ episode: mockEpisode })
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    expect(screen.getByRole('button', { name: 'Skip to start' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /speed/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse now playing' })).toBeInTheDocument()
  })

  it('now-playing overlay shows a responsive srcset image when cover art is set', async () => {
    const user = userEvent.setup()
    mockMobile()
    renderView({
      episode: { ...mockEpisode, cover_art_path: 'https://example.com/detail.webp', cover_art_thumb_path: 'https://example.com/thumb.webp' },
    })
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('srcset', expect.stringContaining('150w'))
    expect(img).toHaveAttribute('srcset', expect.stringContaining('640w'))
  })

  it('collapses back to the mini-bar when the collapse control is tapped', async () => {
    const user = userEvent.setup()
    mockMobile()
    renderView({ episode: mockEpisode })
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    await user.click(screen.getByRole('button', { name: 'Collapse now playing' }))
    expect(screen.queryByRole('button', { name: 'Collapse now playing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip to start' })).not.toBeInTheDocument()
  })

  it('mini-bar play/pause button toggles playing without expanding the overlay', () => {
    mockMobile()
    renderView({ episode: mockEpisode, playing: false })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse now playing' })).not.toBeInTheDocument()
  })
})
