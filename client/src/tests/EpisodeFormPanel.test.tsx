import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EpisodeFormPanel from '../pages/admin/EpisodeFormPanel'
import type { Episode } from '../types'

vi.mock('../api', () => ({
  createEpisode: vi.fn().mockResolvedValue({ id: 99 }),
  updateEpisode: vi.fn().mockResolvedValue({ id: 10 }),
}))

const episode: Episode = {
  id: 10,
  season_id: 1,
  number: 3,
  title: 'Existing Episode',
  description: 'Some desc',
  guests: 'Alice',
  tags: 'tag1,tag2',
  cover_art_path: null,
  duration_seconds: 0,
  publish_date: '2024-01-01',
  audio_type: 'url',
  audio_path: 'http://example.com/audio.mp3',
  hidden: false,
  created_at: '',
  updated_at: '',
}

beforeEach(() => vi.clearAllMocks())

it('renders "New Episode" heading when no episode prop', () => {
  render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText('New Episode')).toBeInTheDocument()
})

it('renders "Edit Episode" heading when episode prop provided', () => {
  render(<EpisodeFormPanel seasonId={1} episode={episode} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText('Edit Episode')).toBeInTheDocument()
})

it('clicking Cancel calls onCancel', async () => {
  const onCancel = vi.fn()
  render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={onCancel} />)
  // Click the Cancel button (not the ✕ close button)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalledOnce()
})

it('renders all form fields', () => {
  render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/episode #/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/publish date/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/audio path\/url/i)).toBeInTheDocument()
})
