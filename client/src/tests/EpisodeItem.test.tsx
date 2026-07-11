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
