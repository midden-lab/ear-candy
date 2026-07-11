import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import SeasonBlock from '../pages/admin/SeasonBlock'
import type { Season, Episode } from '../types'

const season: Season = {
  id: 1,
  number: 1,
  title: 'Pilot Season',
  description: '',
  cover_art_path: null,
  hidden: false,
  created_at: '',
}

const episodes: Episode[] = [
  {
    id: 10,
    season_id: 1,
    number: 1,
    title: 'First Episode',
    description: '',
    guests: '',
    tags: '',
    cover_art_path: null,
    duration_seconds: 0,
    publish_date: '',
    audio_type: 'url',
    audio_path: '',
    hidden: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 11,
    season_id: 1,
    number: 2,
    title: 'Second Episode',
    description: '',
    guests: '',
    tags: '',
    cover_art_path: null,
    duration_seconds: 0,
    publish_date: '',
    audio_type: 'url',
    audio_path: '',
    hidden: false,
    created_at: '',
    updated_at: '',
  },
]

const defaultProps = {
  season,
  episodes,
  onEditSeason: vi.fn(),
  onDeleteSeason: vi.fn(),
  onNewEpisode: vi.fn(),
  onEditEpisode: vi.fn(),
  onDeleteEpisode: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

it('renders season title', () => {
  render(<SeasonBlock {...defaultProps} />)
  expect(screen.getByText('S1: Pilot Season')).toBeInTheDocument()
})

it('renders episode titles', () => {
  render(<SeasonBlock {...defaultProps} />)
  expect(screen.getByText('1. First Episode')).toBeInTheDocument()
  expect(screen.getByText('2. Second Episode')).toBeInTheDocument()
})

it('clicking Edit season calls onEditSeason', async () => {
  render(<SeasonBlock {...defaultProps} />)
  // The first Edit button belongs to the season header
  const editButtons = screen.getAllByText('Edit')
  await userEvent.click(editButtons[0])
  expect(defaultProps.onEditSeason).toHaveBeenCalledWith(season)
})

it('clicking Delete season calls onDeleteSeason after confirmation', async () => {
  render(<SeasonBlock {...defaultProps} />)
  const deleteButtons = screen.getAllByText('Delete')
  await userEvent.click(deleteButtons[0])
  expect(window.confirm).toHaveBeenCalled()
  expect(defaultProps.onDeleteSeason).toHaveBeenCalledWith(season.id)
})

it('does not call onDeleteSeason if confirmation is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SeasonBlock {...defaultProps} />)
  const deleteButtons = screen.getAllByText('Delete')
  await userEvent.click(deleteButtons[0])
  expect(defaultProps.onDeleteSeason).not.toHaveBeenCalled()
})

it('clicking "+ New Episode" calls onNewEpisode', async () => {
  render(<SeasonBlock {...defaultProps} />)
  await userEvent.click(screen.getByText('New Episode'))
  expect(defaultProps.onNewEpisode).toHaveBeenCalledWith(season.id)
})

it('clicking episode Edit calls onEditEpisode', async () => {
  render(<SeasonBlock {...defaultProps} />)
  const editButtons = screen.getAllByText('Edit')
  // editButtons[0] is season Edit, editButtons[1] is first episode Edit
  await userEvent.click(editButtons[1])
  expect(defaultProps.onEditEpisode).toHaveBeenCalledWith(episodes[0])
})

it('clicking episode Delete calls onDeleteEpisode after confirmation', async () => {
  render(<SeasonBlock {...defaultProps} />)
  const deleteButtons = screen.getAllByText('Delete')
  // deleteButtons[0] is season Delete, deleteButtons[1] is first episode Delete
  await userEvent.click(deleteButtons[1])
  expect(defaultProps.onDeleteEpisode).toHaveBeenCalledWith(episodes[0].id)
})

it('does not call onDeleteEpisode if confirmation is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SeasonBlock {...defaultProps} />)
  const deleteButtons = screen.getAllByText('Delete')
  await userEvent.click(deleteButtons[1])
  expect(defaultProps.onDeleteEpisode).not.toHaveBeenCalled()
})
