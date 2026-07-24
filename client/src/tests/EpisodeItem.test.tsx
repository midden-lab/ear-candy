import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EpisodeItem from '../components/EpisodeItem'
import type { Episode } from '../types'

const episode: Episode = {
  id: 1,
  season_id: 1,
  number: 3,
  title: 'Pilot Episode',
  description: 'The first one',
  guests: 'Alice, Bob',
  tags: '',
  cover_art_path: null,
  cover_art_thumb_path: null,
  duration_seconds: 3661,
  publish_date: '2024-01-15',
  audio_type: 'upload',
  audio_path: '/audio/ep1.mp3',
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

it('renders episode number, title, publish_date, duration, and guests', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('Ep 3')).toBeInTheDocument()
  expect(screen.getByText('Pilot Episode')).toBeInTheDocument()
  expect(screen.getByText('2024-01-15')).toBeInTheDocument()
  expect(screen.getByText('1:01:01')).toBeInTheDocument()
  expect(screen.getByText(/Alice, Bob/i)).toBeInTheDocument()
})

it('calls onClick with episode when clicked', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<EpisodeItem episode={episode} isActive={false} onClick={onClick} />)
  await user.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalledWith(episode)
})

it('active state: has left border class, no solid accent fill', () => {
  render(<EpisodeItem episode={episode} isActive={true} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).toHaveAttribute('aria-current', 'true')
  expect(btn).toHaveClass('border-l-2')
  expect(btn).not.toHaveClass('bg-[var(--accent)]')
})

it('inactive state: no aria-current, no border-l-2', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).not.toHaveAttribute('aria-current')
  expect(btn).not.toHaveClass('border-l-2')
})

it('shows EQ indicator when isPlaying is true', () => {
  render(<EpisodeItem episode={episode} isActive={true} isPlaying={true} onClick={() => {}} />)
  expect(document.querySelector('.eq-bars')).toBeInTheDocument()
})

it('does not show EQ indicator when isPlaying is false', () => {
  render(<EpisodeItem episode={episode} isActive={true} isPlaying={false} onClick={() => {}} />)
  expect(document.querySelector('.eq-bars')).not.toBeInTheDocument()
})

it('does not show EQ indicator when isPlaying is omitted', () => {
  render(<EpisodeItem episode={episode} isActive={true} onClick={() => {}} />)
  expect(document.querySelector('.eq-bars')).not.toBeInTheDocument()
})

it('formats duration under 1h as m:ss', () => {
  const short = { ...episode, duration_seconds: 185 }
  render(<EpisodeItem episode={short} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('3:05')).toBeInTheDocument()
})

it('meta row does not wrap and truncates a long guest list to one line', () => {
  const longGuests = { ...episode, guests: 'A Very Long Guest Name, Another Very Long Guest Name, A Third Guest' }
  render(<EpisodeItem episode={longGuests} isActive={false} onClick={() => {}} />)
  const guestsEl = screen.getByText(/A Very Long Guest Name/i)
  expect(guestsEl).toHaveClass('truncate')
  const row = guestsEl.parentElement
  expect(row).not.toHaveClass('flex-wrap')
})

it('renders a lazy-loaded thumbnail when cover_art_thumb_path is set', () => {
  const withArt = { ...episode, cover_art_thumb_path: 'https://example.com/thumb.webp' }
  render(<EpisodeItem episode={withArt} isActive={false} onClick={() => {}} />)
  const img = document.querySelector('img')
  expect(img).toHaveAttribute('src', 'https://example.com/thumb.webp')
  expect(img).toHaveAttribute('loading', 'lazy')
})

it('renders no img, just the placeholder slot, when there is no cover art', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  expect(document.querySelector('img')).not.toBeInTheDocument()
})

it('shows "X left" instead of total duration when remainingSeconds is given', () => {
  render(<EpisodeItem episode={episode} isActive={false} remainingSeconds={185} onClick={() => {}} />)
  // The timestamp digits are wrapped in their own tabular-nums span (so the
  // countdown doesn't make "left" jitter as digit widths vary), so the full
  // "3:05 left" string is split across nodes — match by container instead.
  expect(screen.getByText('3:05')).toBeInTheDocument()
  expect(screen.getByText('3:05').closest('span')?.parentElement).toHaveTextContent('3:05 left')
  expect(screen.queryByText('1:01:01')).not.toBeInTheDocument()
})

it('shows plain total duration when remainingSeconds is omitted', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('1:01:01')).toBeInTheDocument()
  expect(screen.queryByText(/left/)).not.toBeInTheDocument()
})

describe('mobile layout (< md)', () => {
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

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('does not render guests inline (they only appear in DetailPane)', () => {
    mockMobile()
    render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
    expect(screen.queryByText(/Alice, Bob/i)).not.toBeInTheDocument()
  })

  it('still renders episode number, title, publish_date, and duration', () => {
    mockMobile()
    render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
    expect(screen.getByText('Ep 3')).toBeInTheDocument()
    expect(screen.getByText('Pilot Episode')).toBeInTheDocument()
    expect(screen.getByText('2024-01-15')).toBeInTheDocument()
    expect(screen.getByText('1:01:01')).toBeInTheDocument()
  })

  it('renders a played-progress underline under the cover when remainingSeconds indicates partial listening', () => {
    mockMobile()
    // duration 3661s, 185s remaining -> played most of it
    render(<EpisodeItem episode={episode} isActive={false} remainingSeconds={185} onClick={() => {}} />)
    const bar = document.querySelector('.bg-\\[var\\(--accent\\)\\]')
    expect(bar).not.toBeNull()
  })

  it('does not render a progress underline when nothing has been played', () => {
    mockMobile()
    render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
    expect(document.querySelector('.absolute.inset-x-0.bottom-0')).not.toBeInTheDocument()
  })
})
