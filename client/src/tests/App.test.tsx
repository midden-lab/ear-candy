import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, afterEach, describe } from 'vitest'
import App from '../App'
import { usePlayerStore } from '../store/playerStore'
import { getSettings, logout } from '../api'

vi.mock('../api', () => ({
  getSettings: vi.fn().mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    accent_color: '#ff0000',
  }),
  getSeasons: vi.fn().mockResolvedValue([]),
  getEpisodes: vi.fn().mockResolvedValue([]),
  getEpisode: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  deleteSeason: vi.fn(),
  createEpisode: vi.fn(),
  updateEpisode: vi.fn(),
  deleteEpisode: vi.fn(),
  updateSettings: vi.fn(),
}))

beforeEach(() => {
  HTMLMediaElement.prototype.load = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  usePlayerStore.setState({ episode: null, playing: false, currentTime: 0, duration: 0 })
  vi.clearAllMocks()
  // Re-apply HTMLMediaElement mocks after clearAllMocks
  HTMLMediaElement.prototype.load = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
})

it('shows loading initially when settings are pending', () => {
  vi.mocked(getSettings).mockReturnValue(new Promise(() => {}))
  render(<App />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

it('renders player view after settings load', async () => {
  vi.mocked(getSettings).mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    accent_color: '#ff0000',
  })
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
  )
})

it('navigates to admin login when admin button is clicked', async () => {
  const user = userEvent.setup()
  vi.mocked(getSettings).mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    accent_color: '#ff0000',
  })
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
  )
  await user.click(screen.getByRole('button', { name: 'Admin settings' }))
  expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeInTheDocument()
})

describe('admin sign out', () => {
  beforeEach(() => {
    // handleAdminClick and AdminLayout's mount-time check both call
    // /api/admin/session directly via global fetch (not through ../api).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true }),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicking "Sign out" calls the server logout endpoint before returning to the player view', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Test Pod',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      accent_color: '#ff0000',
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Admin settings' }))
    await user.click(await screen.findByText('Sign out'))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
  })

  it('still returns to the player view if the logout request fails', async () => {
    vi.mocked(logout).mockRejectedValueOnce(new Error('network error'))
    const user = userEvent.setup()
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Test Pod',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      accent_color: '#ff0000',
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Admin settings' }))
    await user.click(await screen.findByText('Sign out'))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
  })
})

it('applies accent color from settings to CSS variable', async () => {
  vi.mocked(getSettings).mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    accent_color: '#ff0000',
  })
  render(<App />)
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff0000')
  )
})

describe('document title and favicon', () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove())
  })

  it('sets document.title to the podcast_name from settings', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Positive Sex Ed',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      accent_color: '#ff0000',
    })
    render(<App />)
    await waitFor(() => expect(document.title).toBe('Positive Sex Ed'))
  })

  it('injects a <link rel="icon"> pointing at favicon_path when set', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Test Pod',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: '/images/favicon-abc.png',
      accent_color: '#ff0000',
    })
    render(<App />)
    await waitFor(() => {
      const link = document.querySelector('link[rel="icon"]')
      expect(link).toHaveAttribute('href', '/images/favicon-abc.png')
    })
  })

  it('removes a previously-injected favicon link when favicon_path is null', async () => {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = '/images/stale-favicon.png'
    document.head.appendChild(link)

    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Test Pod',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      accent_color: '#ff0000',
    })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
    )
    expect(document.querySelector('link[rel="icon"]')).not.toBeInTheDocument()
  })
})
