import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminSettings from '../pages/admin/AdminSettings'
import * as api from '../api'

vi.mock('../api', () => ({
  getAdminSettings: vi.fn().mockResolvedValue({
    podcast_name: 'My Pod',
    tagline: 'A tagline',
    description: 'A description',
    cover_art_path: null,
    favicon_path: null,
    browser_tab_title: null,
    accent_color: '#5a3ef5',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
  }),
  updateSettings: vi.fn().mockResolvedValue({
    podcast_name: 'My Pod',
    tagline: 'A tagline',
    description: 'A description',
    cover_art_path: null,
    favicon_path: null,
    browser_tab_title: null,
    accent_color: '#5a3ef5',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
  }),
  uploadFavicon: vi.fn(),
  getMyIp: vi.fn(),
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
    vi.mocked(api.getAdminSettings).mockResolvedValue({
      podcast_name: 'My Pod',
      tagline: 'A tagline',
      description: 'A description',
      cover_art_path: null,
      favicon_path: null,
      browser_tab_title: null,
      accent_color: '#5a3ef5',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
    })
    vi.mocked(api.updateSettings).mockResolvedValue({
      podcast_name: 'My Pod',
      tagline: 'A tagline',
      description: 'A description',
      cover_art_path: null,
      favicon_path: null,
      browser_tab_title: null,
      accent_color: '#5a3ef5',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
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
        browser_tab_title: null,
        tagline: 'A tagline',
        description: 'A description',
        accent_color: '#5a3ef5',
        favicon_path: null,
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: null,
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

  describe('favicon', () => {
    it('uploads a favicon and shows a preview on success', async () => {
      vi.mocked(api.uploadFavicon).mockResolvedValue({ path: '/images/favicon-abc.png' })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())

      const file = new File(['fake favicon'], 'favicon.png', { type: 'image/png' })
      fireEvent.change(screen.getByLabelText('Favicon'), { target: { files: [file] } })

      await waitFor(() => {
        expect(api.uploadFavicon).toHaveBeenCalledWith(file)
        expect(screen.getByAltText('Favicon preview')).toHaveAttribute('src', '/images/favicon-abc.png')
      })
    })

    it('shows an error when the favicon upload fails', async () => {
      vi.mocked(api.uploadFavicon).mockRejectedValue(new Error('Upload failed'))
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())

      const file = new File(['fake favicon'], 'favicon.png', { type: 'image/png' })
      fireEvent.change(screen.getByLabelText('Favicon'), { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
      })
    })

    it('"Remove favicon" clears the preview and includes null in the save payload', async () => {
      vi.mocked(api.uploadFavicon).mockResolvedValue({ path: '/images/favicon-abc.png' })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())

      const file = new File(['fake favicon'], 'favicon.png', { type: 'image/png' })
      fireEvent.change(screen.getByLabelText('Favicon'), { target: { files: [file] } })
      await waitFor(() => expect(screen.getByAltText('Favicon preview')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: /remove favicon/i }))
      expect(screen.queryByAltText('Favicon preview')).not.toBeInTheDocument()

      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ favicon_path: null }))
      })
    })

    it('pre-fills the preview from the loaded settings favicon_path', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValue({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: '/images/favicon-existing.ico',
        browser_tab_title: null,
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: null,
      })
      render(<AdminSettings />)
      await waitFor(() => {
        expect(screen.getByAltText('Favicon preview')).toHaveAttribute('src', '/images/favicon-existing.ico')
      })
    })
  })

  describe('browser tab title', () => {
    it('pre-fills from the loaded settings browser_tab_title', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValue({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: 'Acme Media Co',
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: null,
      })
      render(<AdminSettings />)
      await waitFor(() => {
        expect(screen.getByDisplayValue('Acme Media Co')).toBeInTheDocument()
      })
    })

    it('is blank by default and shows the Podcast Name as a placeholder', async () => {
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())
      expect(screen.getByLabelText('Browser Tab Title')).toHaveValue('')
      expect(screen.getByLabelText('Browser Tab Title')).toHaveAttribute('placeholder', 'My Pod')
    })

    it('includes the entered value in the save payload', async () => {
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Browser Tab Title'), { target: { value: 'Acme Media Co' } })
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ browser_tab_title: 'Acme Media Co' }))
      })
    })

    it('sends null, not an empty string, when the field is cleared', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValue({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: 'Old Title',
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: null,
      })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Browser Tab Title'), { target: { value: '  ' } })
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ browser_tab_title: null }))
      })
    })
  })

  describe('analytics toggles', () => {
    it('renders both checkboxes checked, matching loaded settings', async () => {
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())
      expect(screen.getByLabelText('Enable analytics')).toBeChecked()
      expect(screen.getByLabelText('Track returning listeners')).toBeChecked()
    })

    it('renders both checkboxes unchecked when loaded settings have them off', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValue({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: null,
        accent_color: '#5a3ef5',
        analytics_enabled: false,
        track_returning_listeners: false,
        excluded_analytics_ips: null,
      })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())
      expect(screen.getByLabelText('Enable analytics')).not.toBeChecked()
      expect(screen.getByLabelText('Track returning listeners')).not.toBeChecked()
    })

    it('unchecking "Enable analytics" and saving sends analytics_enabled: false', async () => {
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())

      fireEvent.click(screen.getByLabelText('Enable analytics'))
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ analytics_enabled: false }))
      })
    })

    it('unchecking "Track returning listeners" and saving sends track_returning_listeners: false', async () => {
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('My Pod')).toBeInTheDocument())

      fireEvent.click(screen.getByLabelText('Track returning listeners'))
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ track_returning_listeners: false }))
      })
    })
  })

  describe('excluded IPs', () => {
    it('pre-fills the field from existing settings', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValueOnce({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: null,
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: '203.0.113.5',
      })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('203.0.113.5')).toBeInTheDocument())
    })

    it('"Add my current IP" appends the detected IP, comma-separated, without duplicating an existing entry', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValueOnce({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: null,
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: '203.0.113.5',
      })
      vi.mocked(api.getMyIp).mockResolvedValue({ ip: '198.51.100.9' })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('203.0.113.5')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Add my current IP' }))
      await waitFor(() => expect(screen.getByDisplayValue('203.0.113.5, 198.51.100.9')).toBeInTheDocument())

      // Clicking again with the same detected IP does not duplicate it.
      fireEvent.click(screen.getByRole('button', { name: 'Add my current IP' }))
      await waitFor(() => expect(api.getMyIp).toHaveBeenCalledTimes(2))
      expect(screen.getByDisplayValue('203.0.113.5, 198.51.100.9')).toBeInTheDocument()
    })

    it('saves excluded_analytics_ips: null when the field is emptied', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValueOnce({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: null,
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: '203.0.113.5',
      })
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('203.0.113.5')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Excluded IPs'), { target: { value: '' } })
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ excluded_analytics_ips: null }))
      })
    })

    it('shows an error and preserves the existing value when detecting the current IP fails', async () => {
      vi.mocked(api.getAdminSettings).mockResolvedValueOnce({
        podcast_name: 'My Pod',
        tagline: 'A tagline',
        description: 'A description',
        cover_art_path: null,
        favicon_path: null,
        browser_tab_title: null,
        accent_color: '#5a3ef5',
        analytics_enabled: true,
        track_returning_listeners: true,
        excluded_analytics_ips: '203.0.113.5',
      })
      vi.mocked(api.getMyIp).mockRejectedValueOnce(new Error('HTTP 401'))
      render(<AdminSettings />)
      await waitFor(() => expect(screen.getByDisplayValue('203.0.113.5')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Add my current IP' }))

      await waitFor(() => expect(screen.getByText('HTTP 401')).toBeInTheDocument())
      expect(screen.getByDisplayValue('203.0.113.5')).toBeInTheDocument()
    })
  })
})
