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

// Neutralizes setup.ts's global patch that fires an async `error` event
// whenever `.src` is set (there to stop EpisodeFormPanel's duration probing
// from hanging in tests) — without this, any test here that awaits
// anything after an episode loads gives that pending event a chance to
// fire, flipping into this component's new error/retry state (issue #83)
// unexpectedly. Tests that specifically want the error/loading/resumed
// path fire `error`/`waiting`/`stalled`/`playing` on the <audio> element
// manually instead (see the "loading and error state" describe block).
Object.defineProperty(HTMLMediaElement.prototype, 'src', {
  configurable: true,
  set() {},
  get() { return '' },
})

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

type Overrides = Partial<Pick<AudioPlayerViewProps, 'episode' | 'playing' | 'currentTime' | 'duration' | 'speed' | 'onTapMiniBar'>>

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
      onTapMiniBar={overrides.onTapMiniBar}
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

it('renders a share button on the desktop bar', () => {
  renderView({ episode: mockEpisode })
  expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
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

describe('resumeTime (per-episode resume position)', () => {
  const secondEpisode: Episode = {
    ...mockEpisode,
    id: 2,
    title: 'Second Episode',
    audio_path: 'https://example.com/second.mp3',
  }

  it('seeks the audio element to resumeTime when an episode loads', () => {
    render(
      <AudioPlayerView
        episode={mockEpisode}
        playing={false}
        currentTime={0}
        duration={120}
        speed={1}
        resumeTime={42}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(document.querySelector('audio')!.currentTime).toBe(42)
  })

  it('does not seek when resumeTime is 0/undefined', () => {
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
      />
    )
    expect(document.querySelector('audio')!.currentTime).toBe(0)
  })

  it('applies the new resumeTime again when switching to another episode', () => {
    const { rerender } = render(
      <AudioPlayerView
        episode={mockEpisode}
        playing={false}
        currentTime={0}
        duration={120}
        speed={1}
        resumeTime={42}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(document.querySelector('audio')!.currentTime).toBe(42)

    rerender(
      <AudioPlayerView
        episode={secondEpisode}
        playing={false}
        currentTime={0}
        duration={120}
        speed={1}
        resumeTime={17}
        onSeek={() => {}}
        onTogglePlay={() => {}}
        onSpeedChange={() => {}}
        onTimeUpdate={() => {}}
        onDurationChange={() => {}}
        onEnded={() => {}}
      />
    )
    expect(document.querySelector('audio')!.currentTime).toBe(17)
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

  it('does not show a share button on the mini-bar', () => {
    mockMobile()
    renderView({ episode: mockEpisode })
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
  })

  it('title truncates correctly next to the play button (min-w-0 regression guard)', () => {
    mockMobile()
    renderView({ episode: mockEpisode })
    const title = screen.getByText('Test Episode')
    expect(title).toHaveClass('truncate')
    expect(title.parentElement).toHaveClass('min-w-0')
  })

  it('does not render full transport controls on mobile at all — there is no expanded state anymore', async () => {
    const user = userEvent.setup()
    mockMobile()
    renderView({ episode: mockEpisode })
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    expect(screen.queryByRole('button', { name: 'Skip to start' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /speed/i })).not.toBeInTheDocument()
  })

  it('tapping the mini-bar (outside the play/pause button) calls onTapMiniBar', async () => {
    const user = userEvent.setup()
    mockMobile()
    const onTapMiniBar = vi.fn()
    render(<Harness episode={mockEpisode} onTapMiniBar={onTapMiniBar} />)
    await user.click(screen.getByRole('button', { name: /now playing/i }))
    expect(onTapMiniBar).toHaveBeenCalledTimes(1)
  })

  it('mini-bar play/pause button toggles playing without calling onTapMiniBar', () => {
    mockMobile()
    const onTapMiniBar = vi.fn()
    render(<Harness episode={mockEpisode} playing={false} onTapMiniBar={onTapMiniBar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(onTapMiniBar).not.toHaveBeenCalled()
  })

  it('mini-bar shows a lazy-loaded thumbnail when cover art is set', () => {
    mockMobile()
    renderView({
      episode: { ...mockEpisode, cover_art_path: 'https://example.com/detail.webp', cover_art_thumb_path: 'https://example.com/thumb.webp' },
    })
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/thumb.webp')
    expect(img).toHaveAttribute('loading', 'lazy')
  })
})

describe('loading and error state (issues #82, #83)', () => {
  function baseProps(overrides: Partial<AudioPlayerViewProps> = {}): AudioPlayerViewProps {
    return {
      episode: mockEpisode,
      playing: true,
      currentTime: 0,
      duration: 120,
      speed: 1,
      onSeek: vi.fn(),
      onTogglePlay: vi.fn(),
      onSpeedChange: vi.fn(),
      onTimeUpdate: vi.fn(),
      onDurationChange: vi.fn(),
      onEnded: vi.fn(),
      ...overrides,
    }
  }

  it('shows a Buffering… message and dims the central button while loading', () => {
    render(<AudioPlayerView {...baseProps({ loading: true })} />)
    expect(screen.getByText('Buffering…')).toBeInTheDocument()
    const playBtn = screen.getByRole('button', { name: 'Pause' })
    expect(playBtn).toHaveClass('opacity-60')
    expect(playBtn).toHaveAttribute('aria-busy', 'true')
  })

  it('pausing while loading still works (clicking the dimmed button calls onTogglePlay)', () => {
    const onTogglePlay = vi.fn()
    render(<AudioPlayerView {...baseProps({ loading: true, onTogglePlay })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(onTogglePlay).toHaveBeenCalled()
  })

  it('does not show Buffering… when not loading', () => {
    render(<AudioPlayerView {...baseProps({ loading: false })} />)
    expect(screen.queryByText('Buffering…')).not.toBeInTheDocument()
  })

  it('reserves status-line space even with no status, so the progress bar/controls below never shift as buffering starts/ends', () => {
    // Regression test for a real reported bug: the status line used to be
    // conditionally rendered, so the progress bar and transport controls
    // below it visibly jumped down when buffering started and back up when
    // it ended. It must always be present in the DOM (just invisible).
    render(<AudioPlayerView {...baseProps({ loading: false, error: false })} />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status).toHaveClass('opacity-0')
  })

  it('shows a retry affordance instead of Pause/Play when in the error state', () => {
    const onRetry = vi.fn()
    render(<AudioPlayerView {...baseProps({ error: true, onRetry })} />)
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Retry playback' })
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows a generic interrupted message for an upload-type episode error', () => {
    render(<AudioPlayerView {...baseProps({ error: true, episode: { ...mockEpisode, audio_type: 'upload' } })} />)
    expect(screen.getByText('Playback interrupted — tap retry.')).toBeInTheDocument()
  })

  it('shows a CORS-aware message for a url-type episode error', () => {
    render(<AudioPlayerView {...baseProps({ error: true, episode: { ...mockEpisode, audio_type: 'url' } })} />)
    expect(screen.getByText(/may be unreachable or blocking playback/)).toBeInTheDocument()
  })

  it('error takes precedence over loading in the status message and button', () => {
    render(<AudioPlayerView {...baseProps({ error: true, loading: true })} />)
    expect(screen.queryByText('Buffering…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry playback' })).toBeInTheDocument()
  })

  it('fires onWaiting on the native waiting event', () => {
    const onWaiting = vi.fn()
    const { container } = render(<AudioPlayerView {...baseProps({ onWaiting })} />)
    fireEvent.waiting(container.querySelector('audio')!)
    expect(onWaiting).toHaveBeenCalledTimes(1)
  })

  it('fires onWaiting on the native stalled event too', () => {
    const onWaiting = vi.fn()
    const { container } = render(<AudioPlayerView {...baseProps({ onWaiting })} />)
    fireEvent.stalled(container.querySelector('audio')!)
    expect(onWaiting).toHaveBeenCalledTimes(1)
  })

  it('fires onPlaybackResumed on the native playing event', () => {
    const onPlaybackResumed = vi.fn()
    const { container } = render(<AudioPlayerView {...baseProps({ onPlaybackResumed })} />)
    fireEvent.playing(container.querySelector('audio')!)
    expect(onPlaybackResumed).toHaveBeenCalledTimes(1)
  })

  it('fires onPlaybackError on the native error event', () => {
    const onPlaybackError = vi.fn()
    const { container } = render(<AudioPlayerView {...baseProps({ onPlaybackError })} />)
    fireEvent.error(container.querySelector('audio')!)
    expect(onPlaybackError).toHaveBeenCalledTimes(1)
  })

  it('calls onReset once per actual episode swap', () => {
    const onReset = vi.fn()
    const { rerender } = render(<AudioPlayerView {...baseProps({ onReset })} />)
    expect(onReset).toHaveBeenCalledTimes(1)
    const other: Episode = { ...mockEpisode, id: 2, title: 'Other Episode' }
    rerender(<AudioPlayerView {...baseProps({ onReset, episode: other })} />)
    expect(onReset).toHaveBeenCalledTimes(2)
  })

  it('does not call onReset again on a re-render of the same episode', () => {
    const onReset = vi.fn()
    const { rerender } = render(<AudioPlayerView {...baseProps({ onReset, currentTime: 0 })} />)
    expect(onReset).toHaveBeenCalledTimes(1)
    rerender(<AudioPlayerView {...baseProps({ onReset, currentTime: 5 })} />)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('reloads and re-plays the audio element when retrySignal changes', () => {
    const loadCallsBefore = (HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mock.calls.length
    const playCallsBefore = (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mock.calls.length
    const { rerender } = render(<AudioPlayerView {...baseProps({ retrySignal: 0 })} />)
    rerender(<AudioPlayerView {...baseProps({ retrySignal: 1 })} />)
    expect((HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(loadCallsBefore)
    expect((HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(playCallsBefore)
  })

  it('does not reload on a re-render where retrySignal is unchanged', () => {
    const { rerender } = render(<AudioPlayerView {...baseProps({ retrySignal: 3, currentTime: 0 })} />)
    const loadCallsBefore = (HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mock.calls.length
    rerender(<AudioPlayerView {...baseProps({ retrySignal: 3, currentTime: 10 })} />)
    expect((HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mock.calls.length).toBe(loadCallsBefore)
  })

  it('applies a seekRequest to the real <audio> element and calls onSeek — not just a display-only update', () => {
    const onSeek = vi.fn()
    const { rerender, container } = render(
      <AudioPlayerView {...baseProps({ onSeek, seekRequest: { time: 30, nonce: 1 } })} />
    )
    rerender(<AudioPlayerView {...baseProps({ onSeek, seekRequest: { time: 75, nonce: 2 } })} />)
    const audio = container.querySelector('audio') as HTMLAudioElement
    expect(audio.currentTime).toBe(75)
    expect(onSeek).toHaveBeenCalledWith(75)
  })

  it('does not re-apply a seekRequest whose nonce is unchanged on re-render', () => {
    const onSeek = vi.fn()
    const { rerender } = render(
      <AudioPlayerView {...baseProps({ onSeek, seekRequest: { time: 30, nonce: 1 } })} />
    )
    onSeek.mockClear()
    rerender(<AudioPlayerView {...baseProps({ onSeek, seekRequest: { time: 30, nonce: 1 }, currentTime: 5 })} />)
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('mini-bar reflects loading and error state too', () => {
    mockMobile()
    const { rerender } = render(<AudioPlayerView {...baseProps({ loading: true })} />)
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveClass('opacity-60')

    const onRetry = vi.fn()
    rerender(<AudioPlayerView {...baseProps({ error: true, onRetry })} />)
    const retryBtn = screen.getByRole('button', { name: 'Retry playback' })
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalled()
    window.matchMedia = originalMatchMedia
  })
})
