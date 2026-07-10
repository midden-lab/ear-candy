import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import EpisodeManager from '../pages/admin/EpisodeManager'

vi.mock('../api', () => ({
  getSeasons: vi.fn().mockResolvedValue([
    { id: 1, number: 1, title: 'S1', description: '', cover_art_path: null, hidden: false, created_at: '' },
    { id: 2, number: 2, title: 'S2', description: '', cover_art_path: null, hidden: false, created_at: '' },
  ]),
  getEpisodes: vi.fn().mockResolvedValue([]),
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  deleteSeason: vi.fn(),
  createEpisode: vi.fn(),
  updateEpisode: vi.fn(),
  deleteEpisode: vi.fn(),
  getSettings: vi.fn(),
  getEpisode: vi.fn(),
  login: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

it('renders SeasonBlocks for each season after load', async () => {
  render(<EpisodeManager />)
  await waitFor(() => {
    expect(screen.getByText('S1: S1')).toBeInTheDocument()
    expect(screen.getByText('S2: S2')).toBeInTheDocument()
  })
})

it('renders the Episodes heading', async () => {
  render(<EpisodeManager />)
  await waitFor(() => {
    expect(screen.getByText('Episodes')).toBeInTheDocument()
  })
})
