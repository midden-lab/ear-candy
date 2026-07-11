import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import DetailPane from '../components/DetailPane'
import type { Episode, Season } from '../types'

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

it('renders each guest as a blue pill badge', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  const janeEl = screen.getByText('Jane Doe')
  const johnEl = screen.getByText('John Smith')
  expect(janeEl).toHaveClass('bg-blue-900')
  expect(johnEl).toHaveClass('bg-blue-900')
})

it('renders each tag as a purple pill badge', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  const comedyEl = screen.getByText('comedy')
  const dramaEl = screen.getByText('drama')
  expect(comedyEl).toHaveClass('bg-purple-900')
  expect(dramaEl).toHaveClass('bg-purple-900')
})

it('shows "About this episode" label before description', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByText('About this episode')).toBeInTheDocument()
  expect(screen.getByText('An interesting description')).toBeInTheDocument()
})

it('renders cover art image when cover_art_path is set', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.getByRole('img', { name: 'My Great Episode' })).toBeInTheDocument()
})

it('does not render img when cover_art_path is null', () => {
  render(<DetailPane episode={{ ...mockEpisode, cover_art_path: null }} seasons={seasons} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('does not render a back button when onBack is not provided', () => {
  render(<DetailPane episode={mockEpisode} seasons={seasons} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('renders a back button and calls onBack when clicked, given onBack', async () => {
  const user = userEvent.setup()
  const onBack = vi.fn()
  render(<DetailPane episode={mockEpisode} seasons={seasons} onBack={onBack} />)
  const backButton = screen.getByRole('button', { name: /back to episodes/i })
  await user.click(backButton)
  expect(onBack).toHaveBeenCalledTimes(1)
})
