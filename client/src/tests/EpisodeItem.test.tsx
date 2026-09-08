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

it('renders episode number, title, and duration — matching the mockup\'s exact 3-field row (no date, no guests, no thumbnail)', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('Pilot Episode')).toBeInTheDocument()
  expect(screen.getByText('1:01:01')).toBeInTheDocument()
  expect(screen.queryByText('2024-01-15')).not.toBeInTheDocument()
  expect(screen.queryByText(/Alice, Bob/i)).not.toBeInTheDocument()
  expect(document.querySelector('img')).not.toBeInTheDocument()
})

it('calls onClick with episode when clicked', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<EpisodeItem episode={episode} isActive={false} onClick={onClick} />)
  await user.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalledWith(episode)
})

it('active state: .row.is-viewed, aria-current', () => {
  render(<EpisodeItem episode={episode} isActive={true} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).toHaveAttribute('aria-current', 'true')
  expect(btn).toHaveClass('row', 'is-viewed')
})

it('inactive state: plain .row, no aria-current', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).not.toHaveAttribute('aria-current')
  expect(btn).toHaveClass('row')
  expect(btn).not.toHaveClass('is-viewed')
})

it('shows EQ indicator and .is-playing when isPlaying is true', () => {
  render(<EpisodeItem episode={episode} isActive={true} isPlaying={true} onClick={() => {}} />)
  expect(screen.getByRole('button')).toHaveClass('is-playing')
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

it('renders the season tag inline before the title for cross-catalog search results', () => {
  render(<EpisodeItem episode={episode} isActive={false} seasonTag="S9" onClick={() => {}} />)
  expect(screen.getByText('S9')).toBeInTheDocument()
  expect(screen.getByText('S9').parentElement).toHaveTextContent('S9Pilot Episode')
})

it('shows "X left" instead of total duration when remainingSeconds is given, and marks the row .partial', () => {
  render(<EpisodeItem episode={episode} isActive={false} remainingSeconds={185} onClick={() => {}} />)
  expect(screen.getByText('3:05 left')).toBeInTheDocument()
  expect(screen.queryByText('1:01:01')).not.toBeInTheDocument()
  expect(screen.getByRole('button')).toHaveClass('partial')
})

it('shows plain total duration, and no .partial class, when remainingSeconds is omitted', () => {
  render(<EpisodeItem episode={episode} isActive={false} onClick={() => {}} />)
  expect(screen.getByText('1:01:01')).toBeInTheDocument()
  expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  expect(screen.getByRole('button')).not.toHaveClass('partial')
})

it('does not mark the row .partial when it is the one currently playing (even with remainingSeconds set)', () => {
  render(<EpisodeItem episode={episode} isActive={true} isPlaying remainingSeconds={185} onClick={() => {}} />)
  const btn = screen.getByRole('button')
  expect(btn).toHaveClass('is-playing')
  expect(btn).not.toHaveClass('partial')
})
