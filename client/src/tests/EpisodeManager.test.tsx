import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  createEpisode: vi.fn().mockResolvedValue({ id: 99, season_id: 1, number: 1, title: 'New Episode', description: '', guests: '', tags: '', cover_art_path: null, duration_seconds: 0, publish_date: '2024-01-01', audio_type: 'url', audio_path: 'http://example.com/audio.mp3', hidden: false, created_at: '', updated_at: '' }),
  updateEpisode: vi.fn(),
  deleteEpisode: vi.fn(),
  getSettings: vi.fn(),
  getEpisode: vi.fn(),
  login: vi.fn(),
}))

import { getEpisodes, createEpisode }  from '../api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getEpisodes).mockResolvedValue([])
})

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

describe('episode creation flow', () => {
  it('clicking "+ New Episode" opens the form panel', async () => {
    render(<EpisodeManager />)
    await waitFor(() => {
      expect(screen.getByText('S1: S1')).toBeInTheDocument()
    })
    const newEpisodeButtons = screen.getAllByText('+ New Episode')
    await userEvent.click(newEpisodeButtons[0])
    expect(screen.getByText('New Episode')).toBeInTheDocument()
  })

  it('submitting the form creates an episode and adds it to the list', async () => {
    vi.mocked(getEpisodes).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 99, season_id: 1, number: 1, title: 'Test Episode', description: '', guests: '', tags: '', cover_art_path: null, duration_seconds: 1, publish_date: '2024-01-01', audio_type: 'url', audio_path: 'http://example.com/audio.mp3', hidden: false, created_at: '', updated_at: '' },
    ])

    render(<EpisodeManager />)
    await waitFor(() => {
      expect(screen.getByText('S1: S1')).toBeInTheDocument()
    })

    const newEpisodeButtons = screen.getAllByText('+ New Episode')
    await userEvent.click(newEpisodeButtons[0])
    expect(screen.getByText('New Episode')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/title/i), 'Test Episode')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/audio.mp3')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(createEpisode).toHaveBeenCalledWith(expect.objectContaining({
        season_id: 1,
        title: 'Test Episode',
        number: 1,
        publish_date: '2024-01-01',
        audio_type: 'url',
        audio_path: 'http://example.com/audio.mp3',
      }))
    })

    await waitFor(() => {
      expect(screen.getByText('1. Test Episode')).toBeInTheDocument()
    })
  })
})
