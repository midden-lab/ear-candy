import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, afterEach } from 'vitest'
import DetailPane from '../components/DetailPane'
import type { Episode, Season } from '../types'

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

const seasons: Season[] = [
  { id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z' },
]

const mockEpisode: Episode = {
  id: 1,
  season_id: 1,
  number: 4,
  title: 'My Great Episode',
  description: 'An interesting description',
  guests: 'Jane Doe, John Smith',
  tags: 'comedy, drama',
  cover_art_path: 'https://example.com/cover.jpg',
  cover_art_thumb_path: 'https://example.com/cover-thumb.jpg',
  duration_seconds: 3600,
  publish_date: '2024-03-15',
  audio_type: 'upload',
  audio_path: '/uploads/ep1.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

it('shows placeholder when episode is null', () => {
  render(<DetailPane episode={null} seasons={seasons} />)
  expect(screen.getByText('Select an episode to begin')).toBeInTheDocument()
})

it('shows episode title and publish_date', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('My Great Episode')).toBeInTheDocument()
  expect(screen.getByText('2024-03-15')).toBeInTheDocument()
})

it('shows season and episode label', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('Season One · Episode 4')).toBeInTheDocument()
})

it('renders guests as plain text ("With <strong>Name</strong>, ...") — matches the mockup exactly, no pill badges (plans/010)', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('Jane Doe').tagName).toBe('STRONG')
  expect(screen.getByText('John Smith').tagName).toBe('STRONG')
  expect(screen.getByText('Jane Doe').closest('p')).toHaveClass('guests')
})

it('does not render tags anywhere — the mockup has no equivalent, dropped in the direct-port pass (plans/010)', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.queryByText('comedy')).not.toBeInTheDocument()
  expect(screen.queryByText('drama')).not.toBeInTheDocument()
})

it('shows "About" label before description, matching the mockup\'s .body-label exactly (desktop)', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('About')).toBeInTheDocument()
  expect(screen.getByText('An interesting description')).toBeInTheDocument()
})

it('renders cover art image when cover_art_path is set', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  const img = screen.getByRole('img', { name: 'My Great Episode' })
  expect(img).toBeInTheDocument()
  expect(img).toHaveAttribute('loading', 'lazy')
  expect(img).toHaveAttribute('srcset', expect.stringContaining('150w'))
  expect(img).toHaveAttribute('srcset', expect.stringContaining('640w'))
})

it('does not render img when cover_art_path is null', () => {
  render(<DetailPane episode={{ ...mockEpisode, cover_art_path: null, cover_art_thumb_path: null }} seasons={seasons} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('does not render a back button when onBack is not provided', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.queryByText('Back to episodes')).not.toBeInTheDocument()
})

it('renders a back button and calls onBack when clicked, given onBack (mobile only — .m-back has no desktop equivalent)', async () => {
  mockMobile()
  const user = userEvent.setup()
  const onBack = vi.fn()
  render(<DetailPane episode={mockEpisode} seasons={seasons} onBack={onBack} />)
  const backButton = screen.getByRole('button', { name: 'Back to episodes' })
  await user.click(backButton)
  expect(onBack).toHaveBeenCalledTimes(1)
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('play/pause button', () => {
  it('does not render a play button when onPlayPause is not provided', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} />)
    expect(screen.queryByText('Play')).not.toBeInTheDocument()
  })

  it('shows "Play" when this episode is not the one loaded in the player', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={false} playing={false} onPlayPause={() => {}} />)
    expect(screen.getByText('Play')).toBeInTheDocument()
  })

  it('shows "Play" (not "Pause") when this episode IS loaded but currently paused', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} playing={false} onPlayPause={() => {}} />)
    expect(screen.getByText('Play')).toBeInTheDocument()
  })

  it('shows "Pause" only when this episode is both loaded and playing', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} playing={true} onPlayPause={() => {}} />)
    expect(screen.getByText('Pause')).toBeInTheDocument()
  })

  it('calls onPlayPause when clicked', async () => {
    const user = userEvent.setup()
    const onPlayPause = vi.fn()
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={false} onPlayPause={onPlayPause} />)
    await user.click(screen.getByText('Play'))
    expect(onPlayPause).toHaveBeenCalledTimes(1)
  })

  it('has an accessible name distinct from the player bar\'s own Play/Pause buttons', () => {
    // Both can be on screen simultaneously once this episode is loaded and
    // playing — an identical accessible name on two different buttons
    // would be ambiguous for screen readers and any role-based query.
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} playing={true} onPlayPause={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pause episode' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })
})

describe('loading/error/retry state (issues #82, #83, #84)', () => {
  it('dims the button and shows Buffering… only when this episode is the one loading', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} playing={true} loading={true} onPlayPause={() => {}} />)
    expect(screen.getByText('Buffering…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause episode' })).toHaveClass('opacity-60')
  })

  it('does not show Buffering… when a different episode is loading (not this one)', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={false} loading={true} onPlayPause={() => {}} />)
    expect(screen.queryByText('Buffering…')).not.toBeInTheDocument()
  })

  it('reserves status-line space even with no status, so content below never shifts as buffering starts/ends', () => {
    // Regression test for a real reported bug: the status line used to be
    // conditionally rendered, so the description/pill badges below it
    // visibly jumped down when buffering started and back up when it
    // ended. It must always be present in the DOM (just invisible) instead.
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} playing={true} onPlayPause={() => {}} />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status).toHaveClass('opacity-0')
  })

  it('shows Retry instead of Pause/Play when this episode is the one erroring', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} playing={true} error={true} onPlayPause={() => {}} />)
    expect(screen.getByRole('button', { name: 'Retry episode' })).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
    expect(screen.queryByText('Pause')).not.toBeInTheDocument()
  })

  it('calls onRetry (not onPlayPause) when clicked in the error state', async () => {
    const user = userEvent.setup()
    const onPlayPause = vi.fn()
    const onRetry = vi.fn()
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} error={true} onPlayPause={onPlayPause} onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: 'Retry episode' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onPlayPause).not.toHaveBeenCalled()
  })

  it('does not show the error state for a different episode than the one erroring', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={false} error={true} onPlayPause={() => {}} />)
    expect(screen.getByText('Play')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry episode' })).not.toBeInTheDocument()
  })

  it('shows a CORS-aware hint for a url-type episode error', () => {
    const urlEpisode = { ...mockEpisode, audio_type: 'url' as const }
    render(<DetailPane episode={urlEpisode} seasons={seasons} isCurrentPlayerEpisode={true} error={true} onPlayPause={() => {}} />)
    expect(screen.getByText(/may be unreachable or blocking playback/)).toBeInTheDocument()
  })

  it('shows a generic message for an upload-type episode error', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} error={true} onPlayPause={() => {}} />)
    expect(screen.getByText('Playback interrupted — tap retry.')).toBeInTheDocument()
  })
})

describe('share control', () => {
  it('renders a share trigger for any viewed episode', () => {
    render(<DetailPane episode={mockEpisode} seasons={seasons} />)
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument()
  })

  it('offers a "start at" timestamp share when this episode is the one actually playing, past the minimum threshold', async () => {
    const user = userEvent.setup()
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} currentTime={90} />)
    await user.click(screen.getByRole('button', { name: 'Share this moment' }))
    expect(screen.getByText(/Start at/)).toBeInTheDocument()
  })

  it('offers only a beginning-only share when this episode is merely being viewed, not playing — even if a currentTime happens to be passed', async () => {
    const user = userEvent.setup()
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={false} currentTime={90} />)
    await user.click(screen.getByRole('button', { name: 'Share episode' }))
    expect(screen.queryByText(/Start at/)).not.toBeInTheDocument()
  })

  it('offers only a beginning-only share when this episode is playing but under the minimum timestamp threshold', async () => {
    const user = userEvent.setup()
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} currentTime={2} />)
    await user.click(screen.getByRole('button', { name: 'Share episode' }))
    expect(screen.queryByText(/Start at/)).not.toBeInTheDocument()
  })
})

describe('playback transport (scrub bar, skip, speed) — mobile only (plans/010 Step 4)', () => {
  // Confirmed against the mockup's actual markup: the desktop .stage has
  // ONLY the big Play button — scrub/skip/speed exist solely in the fixed
  // dock there. Only the mobile .m-pane's .m-now-controls duplicates
  // transport inline, so every test below mocks mobile explicitly.
  const transportProps = {
    episode: mockEpisode,
    seasons,
    isCurrentPlayerEpisode: true,
    currentTime: 60,
    duration: 3600,
    speed: 1,
    onRequestSeek: vi.fn(),
    onSpeedChange: vi.fn(),
  }

  it('never renders inline transport controls on desktop, regardless of props', () => {
    render(<DetailPane {...transportProps} />)
    expect(screen.queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back 15 seconds' })).not.toBeInTheDocument()
  })

  it('does not render transport controls when isCurrentPlayerEpisode is false, even with all other props present', () => {
    mockMobile()
    render(<DetailPane {...transportProps} isCurrentPlayerEpisode={false} />)
    expect(screen.queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back 15 seconds' })).not.toBeInTheDocument()
  })

  it('does not render transport controls when required playback props are missing, even if isCurrentPlayerEpisode is true', () => {
    mockMobile()
    render(<DetailPane episode={mockEpisode} seasons={seasons} isCurrentPlayerEpisode={true} />)
    expect(screen.queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument()
  })

  it('renders the scrub bar, times, and skip/speed controls when this episode is the one playing', () => {
    mockMobile()
    render(<DetailPane {...transportProps} />)
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument()
    expect(screen.getByText('1:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Playback speed' })).toBeInTheDocument()
  })

  it('does not render a redundant central play/pause button inside the transport row', () => {
    mockMobile()
    render(<DetailPane {...transportProps} />)
    // The mockup's own .m-np-transport never has one either — only the
    // separate, distinctly-labeled "Play episode"/"Pause episode" button
    // above it does.
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  it('calls onRequestSeek with a clamped target when skipping back 15 seconds', async () => {
    mockMobile()
    const user = userEvent.setup()
    const onRequestSeek = vi.fn()
    render(<DetailPane {...transportProps} currentTime={10} onRequestSeek={onRequestSeek} />)
    await user.click(screen.getByRole('button', { name: 'Back 15 seconds' }))
    expect(onRequestSeek).toHaveBeenCalledWith(0)
  })

  it('calls onRequestSeek with a clamped target when skipping forward 15 seconds past the end', async () => {
    mockMobile()
    const user = userEvent.setup()
    const onRequestSeek = vi.fn()
    render(<DetailPane {...transportProps} currentTime={3590} duration={3600} onRequestSeek={onRequestSeek} />)
    await user.click(screen.getByRole('button', { name: 'Forward 15 seconds' }))
    expect(onRequestSeek).toHaveBeenCalledWith(3600)
  })

  it('calls onSpeedChange with the next speed in the cycle when the speed control is clicked', async () => {
    mockMobile()
    const user = userEvent.setup()
    const onSpeedChange = vi.fn()
    render(<DetailPane {...transportProps} speed={1} onSpeedChange={onSpeedChange} />)
    await user.click(screen.getByRole('button', { name: 'Playback speed' }))
    expect(onSpeedChange).toHaveBeenCalledWith(1.5)
  })

  it('calls onRequestSeek (not a bare setCurrentTime-style callback) when the scrub bar itself is clicked', () => {
    mockMobile()
    const onRequestSeek = vi.fn()
    render(<DetailPane {...transportProps} onRequestSeek={onRequestSeek} />)
    const slider = screen.getByRole('slider', { name: 'Seek' })
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 100, width: 100, top: 0, bottom: 3, height: 3, x: 0, y: 0, toJSON: () => {},
    })
    // Clicking at x=50 of a 100px-wide, 3600s-duration bar seeks to ~1800s.
    slider.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50 }))
    expect(onRequestSeek).toHaveBeenCalledWith(1800)
  })
})
