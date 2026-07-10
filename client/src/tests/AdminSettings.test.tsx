import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminSettings from '../pages/admin/AdminSettings'
import * as api from '../api'

vi.mock('../api', () => ({
  getSettings: vi.fn().mockResolvedValue({
    podcast_name: 'My Pod',
    tagline: 'A tagline',
    description: 'A description',
    cover_art_path: null,
    accent_color: '#5a3ef5',
  }),
  updateSettings: vi.fn().mockResolvedValue({
    podcast_name: 'My Pod',
    tagline: 'A tagline',
    description: 'A description',
    cover_art_path: null,
    accent_color: '#5a3ef5',
  }),
  // stub rest
  getSeasons: vi.fn(),
  getEpisodes: vi.fn(),
  getEpisode: vi.fn(),
  login: vi.fn(),
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  deleteSeason: vi.fn(),
  createEpisode: vi.fn(),
  updateEpisode: vi.fn(),
  deleteEpisode: vi.fn(),
}))

describe('AdminSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getSettings).mockResolvedValue({
      podcast_name: 'My Pod',
      tagline: 'A tagline',
      description: 'A description',
      cover_art_path: null,
      accent_color: '#5a3ef5',
    })
    vi.mocked(api.updateSettings).mockResolvedValue({
      podcast_name: 'My Pod',
      tagline: 'A tagline',
      description: 'A description',
      cover_art_path: null,
      accent_color: '#5a3ef5',
    })
  })

  it('renders Settings heading', () => {
    render(<AdminSettings />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('loads and displays current settings in form fields', async () => {
    render(<AdminSettings />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('A tagline')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A description')).toBeInTheDocument()
    expect(screen.getByDisplayValue('#5a3ef5')).toBeInTheDocument()
  })

  it('submitting form calls updateSettings with form data', async () => {
    render(<AdminSettings />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Podcast Name'), { target: { value: 'Updated Pod' } })
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        podcast_name: 'Updated Pod',
        tagline: 'A tagline',
        description: 'A description',
        accent_color: '#5a3ef5',
      })
    })
  })

  it('shows "Settings saved!" after successful save', async () => {
    render(<AdminSettings />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument()
    })

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Settings saved!')
    })
  })
})
