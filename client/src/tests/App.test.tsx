import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, afterEach, describe } from 'vitest'
import App from '../App'
import { usePlayerStore } from '../store/playerStore'
import { getSettings, getSeasons, getEpisodes, getEpisode, logout } from '../api'
import { trackPageView } from '../utils/analytics'
import { getDarkModeAccent } from '../utils/color'
import type { Season, Episode } from '../types'

vi.mock('../utils/analytics', () => ({
  trackPageView: vi.fn(),
  trackPlayStart: vi.fn(),
  trackListenProgress: vi.fn(),
  trackPlayComplete: vi.fn(),
}))

vi.mock('../api', () => ({
  getSettings: vi.fn().mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    browser_tab_title: null,
    accent_color: '#ff0000',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
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

// Neutralizes setup.ts's global patch that fires an async `error` event
// whenever `.src` is set (there to stop EpisodeFormPanel's duration probing
// from hanging in tests) — without this, any test here that awaits
// anything after an episode loads (userEvent, findBy*) gives that pending
// event a chance to fire, flipping the player into its new error/retry
// state (issue #83) and breaking assertions that have nothing to do with
// playback errors. Tests that specifically want to exercise the error path
// fire `error`/`waiting`/`playing` on the <audio> element manually instead.
function neutralizeAutoMediaError() {
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    set() {},
    get() { return '' },
  })
}

beforeEach(() => {
  HTMLMediaElement.prototype.load = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  neutralizeAutoMediaError()
  usePlayerStore.setState({
    episode: null, playing: false, currentTime: 0, duration: 0,
    loading: false, error: false, retryNonce: 0,
  })
  vi.clearAllMocks()
  // Re-apply HTMLMediaElement mocks after clearAllMocks
  HTMLMediaElement.prototype.load = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  neutralizeAutoMediaError()
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
    browser_tab_title: null,
    accent_color: '#ff0000',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
  })
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  )
})

it('fires trackPageView exactly once per app mount, even under StrictMode double-invocation', async () => {
  vi.mocked(getSettings).mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    browser_tab_title: null,
    accent_color: '#ff0000',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
  })
  render(<StrictMode><App /></StrictMode>)
  // Wait on the effect's own observable side effect directly, not on an
  // unrelated DOM assertion — the "Admin" button commits as soon
  // as `settings` state updates, which happens synchronously and BEFORE
  // React's passive effects (where trackPageView() lives) are guaranteed
  // to have run. Asserting via the button was a race that happened to
  // resolve reliably locally but lost once in CI (0 calls observed).
  // StrictMode's double-invoke of an effect with no cleanup runs both
  // passes back-to-back with no async gap, so once any call is observed
  // here, the guard's second (no-op) pass has already happened too —
  // "wait for called" then "assert called once" is safe, not another race.
  await waitFor(() => expect(trackPageView).toHaveBeenCalled())
  expect(trackPageView).toHaveBeenCalledTimes(1)
})

it('navigates to admin login when admin button is clicked', async () => {
  const user = userEvent.setup()
  vi.mocked(getSettings).mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    browser_tab_title: null,
    accent_color: '#ff0000',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
  })
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  )
  await user.click(screen.getByRole('button', { name: 'Admin' }))
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
      browser_tab_title: null,
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Admin' }))
    await user.click(await screen.findByText('Sign out'))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Admin' })).toBeInTheDocument()
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
      browser_tab_title: null,
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Admin' }))
    await user.click(await screen.findByText('Sign out'))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Admin' })).toBeInTheDocument()
  })
})

it('applies accent color from settings to CSS variable', async () => {
  vi.mocked(getSettings).mockResolvedValue({
    podcast_name: 'Test Pod',
    tagline: '',
    description: '',
    cover_art_path: null,
    favicon_path: null,
    browser_tab_title: null,
    accent_color: '#ff0000',
    analytics_enabled: true,
    track_returning_listeners: true,
    excluded_analytics_ips: null,
  })
  render(<App />)
  // No 'theme' localStorage preference is set anywhere in this test file, so
  // the app renders in its dark-as-default mode, which lightens the raw
  // accent color (see useTheme.ts / getDarkModeAccent) rather than passing
  // it through unchanged.
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(getDarkModeAccent('#ff0000'))
  )
})

describe('document title and favicon', () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove())
  })

  it('sets document.title to the podcast_name from settings when browser_tab_title is unset', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Positive Sex Ed',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      browser_tab_title: null,
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
    })
    render(<App />)
    await waitFor(() => expect(document.title).toBe('Positive Sex Ed'))
  })

  it('sets document.title to browser_tab_title when set, overriding podcast_name', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Ear Candy',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      browser_tab_title: 'Positive Sex Ed',
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
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
      browser_tab_title: null,
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
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
      browser_tab_title: null,
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
    })
    render(<App />)
    await waitFor(() =>
      expect(document.querySelector('link[rel="icon"]')).not.toBeInTheDocument()
    )
  })
})

describe('deep-linked shared episode (?episode=X&t=Y)', () => {
  const season: Season = {
    id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z',
  }
  const otherSeason: Season = { ...season, id: 2, number: 2, title: 'Season Two' }
  const sharedEpisode: Episode = {
    id: 55, season_id: 2, number: 3, title: 'Shared Episode', description: '', guests: '', tags: '',
    cover_art_path: null, cover_art_thumb_path: null, duration_seconds: 1000, publish_date: '2024-05-01',
    audio_type: 'url', audio_path: 'https://example.com/ep.mp3', hidden: false,
    created_at: '2024-05-01T00:00:00Z', updated_at: '2024-05-01T00:00:00Z',
  }

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('loads the shared episode into the player, paused, without needing its season to be first', async () => {
    window.history.replaceState(null, '', '/?episode=55&t=120')
    vi.mocked(getSeasons).mockResolvedValue([season, otherSeason])
    vi.mocked(getEpisode).mockResolvedValue(sharedEpisode)
    vi.mocked(getEpisodes).mockResolvedValue([sharedEpisode])

    render(<App />)

    await waitFor(() => expect(usePlayerStore.getState().episode?.id).toBe(55))
    expect(usePlayerStore.getState().playing).toBe(false)
    expect(getEpisode).toHaveBeenCalledWith(55)
    // Episode list for the deep-linked episode's own season is fetched, not
    // whatever season happens to sort first.
    await waitFor(() => expect(getEpisodes).toHaveBeenCalledWith(2))
  })

  it('falls through to the default first season when the shared episode id is invalid or inaccessible', async () => {
    window.history.replaceState(null, '', '/?episode=999')
    vi.mocked(getSeasons).mockResolvedValue([season, otherSeason])
    vi.mocked(getEpisode).mockRejectedValue(new Error('HTTP 404'))
    vi.mocked(getEpisodes).mockResolvedValue([])

    render(<App />)

    await waitFor(() => expect(getEpisodes).toHaveBeenCalledWith(1))
    expect(usePlayerStore.getState().episode).toBeNull()
  })

  it('ignores a non-numeric episode param and behaves like a plain visit', async () => {
    window.history.replaceState(null, '', '/?episode=not-a-number')
    vi.mocked(getSeasons).mockResolvedValue([season])
    vi.mocked(getEpisodes).mockResolvedValue([])

    render(<App />)

    await waitFor(() => expect(getEpisodes).toHaveBeenCalledWith(1))
    expect(getEpisode).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().episode).toBeNull()
  })
})

describe('browsing vs. playing decoupling', () => {
  const season: Season = {
    id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z',
  }
  const episodeA: Episode = {
    id: 1, season_id: 1, number: 1, title: 'Episode A', description: '', guests: '', tags: '',
    cover_art_path: null, cover_art_thumb_path: null, duration_seconds: 100, publish_date: '2024-01-01',
    audio_type: 'url', audio_path: 'https://example.com/a.mp3', hidden: false,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  }
  const episodeB: Episode = { ...episodeA, id: 2, number: 2, title: 'Episode B', audio_path: 'https://example.com/b.mp3' }

  beforeEach(() => {
    vi.mocked(getSeasons).mockResolvedValue([season])
    vi.mocked(getEpisodes).mockResolvedValue([episodeA, episodeB])
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('clicking an episode shows its details but does not touch the player', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    expect(await screen.findByText('Play')).toBeInTheDocument()
    expect(usePlayerStore.getState().episode).toBeNull()
    expect(usePlayerStore.getState().playing).toBe(false)
  })

  it('pressing Play in the detail pane loads and starts the viewed episode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    expect(usePlayerStore.getState().episode?.id).toBe(1)
    expect(usePlayerStore.getState().playing).toBe(true)
  })

  it('browsing to a different episode does not interrupt one already playing in the background', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    expect(usePlayerStore.getState().episode?.id).toBe(1)

    // Browse to Episode B's detail view — must not disturb playback of A.
    await user.click(await screen.findByText('Episode B'))
    expect(usePlayerStore.getState().episode?.id).toBe(1)
    expect(usePlayerStore.getState().playing).toBe(true)
    // The detail pane now shows B's own (not-yet-loaded) Play button.
    expect(await screen.findByText('Play')).toBeInTheDocument()
  })

  it('pressing Play on a different episode than the one playing switches the player to it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    await user.click(await screen.findByText('Episode B'))
    await user.click(await screen.findByText('Play'))
    expect(usePlayerStore.getState().episode?.id).toBe(2)
    expect(usePlayerStore.getState().playing).toBe(true)
  })

  it('pressing the detail-pane button again on the already-loaded episode toggles pause, then play', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    expect(usePlayerStore.getState().playing).toBe(true)

    await user.click(await screen.findByText('Pause'))
    expect(usePlayerStore.getState().playing).toBe(false)
    expect(usePlayerStore.getState().episode?.id).toBe(1)

    await user.click(await screen.findByText('Play'))
    expect(usePlayerStore.getState().playing).toBe(true)
  })
})

describe('mobile tab bar navigation (< md)', () => {
  const originalMatchMedia = window.matchMedia

  function mockMobile() {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  beforeEach(() => {
    mockMobile()
    vi.mocked(getSettings).mockResolvedValue({
      podcast_name: 'Test Pod',
      tagline: '',
      description: '',
      cover_art_path: null,
      favicon_path: null,
      browser_tab_title: null,
      accent_color: '#ff0000',
      analytics_enabled: true,
      track_returning_listeners: true,
      excluded_analytics_ips: null,
    })
    vi.mocked(getSeasons).mockResolvedValue([])
    vi.mocked(getEpisodes).mockResolvedValue([])
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('the Episodes tab (not Settings) reaches Admin login', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 'list' (Episodes) is the default focused pane, so Admin is reachable
    // immediately without switching tabs.
    expect(await screen.findByRole('button', { name: 'Admin' })).toBeInTheDocument()

    // Settings no longer has an Admin control — it moved to sit next to the
    // analytics disclosure in the episode list.
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Episodes' }))
    await user.click(await screen.findByRole('button', { name: 'Admin' }))
    expect(await screen.findByRole('heading', { name: 'Admin Login' })).toBeInTheDocument()
  })

  it('the Playing tab is always enabled, and navigates to the detail placeholder when nothing has ever played', async () => {
    const user = userEvent.setup()
    render(<App />)
    const playingTab = await screen.findByRole('button', { name: 'Playing' })
    expect(playingTab).toBeEnabled()
    await user.click(playingTab)
    expect(await screen.findByText('Select an episode to begin')).toBeInTheDocument()
    // Both viewingEpisode and playerEpisode are null here — this must still
    // count as "on the Playing tab", not fall through to no-tab-active.
    expect(playingTab).toHaveAttribute('aria-current', 'true')
  })
})

describe('Playing tab reflects actual playback state (< md)', () => {
  const originalMatchMedia = window.matchMedia

  function mockMobile() {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  const season: Season = {
    id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z',
  }
  const episodeA: Episode = {
    id: 1, season_id: 1, number: 1, title: 'Episode A', description: '', guests: '', tags: '',
    cover_art_path: null, cover_art_thumb_path: null, duration_seconds: 100, publish_date: '2024-01-01',
    audio_type: 'url', audio_path: 'https://example.com/a.mp3', hidden: false,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  }
  const episodeB: Episode = { ...episodeA, id: 2, number: 2, title: 'Episode B', audio_path: 'https://example.com/b.mp3' }

  beforeEach(() => {
    mockMobile()
    vi.mocked(getSeasons).mockResolvedValue([season])
    vi.mocked(getEpisodes).mockResolvedValue([episodeA, episodeB])
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('tapping Playing after starting an episode navigates to its detail view and highlights the Playing tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    await user.click(await screen.findByRole('button', { name: 'Episodes' }))
    await user.click(await screen.findByRole('button', { name: 'Playing' }))
    // Both the still-visible mini-bar and DetailPane's own heading show
    // "Episode A" once it's playing — target the heading specifically to
    // disambiguate, rather than the ambiguous plain text.
    expect(await screen.findByRole('heading', { name: 'Episode A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Playing' })).toHaveAttribute('aria-current', 'true')
  })

  it('tapping the mini-bar itself (not the tab) also navigates to the playing episode\'s detail view', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    await user.click(await screen.findByRole('button', { name: 'Episodes' }))
    await user.click(await screen.findByRole('button', { name: /Now playing: Episode A/ }))
    expect(await screen.findByRole('heading', { name: 'Episode A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Playing' })).toHaveAttribute('aria-current', 'true')
  })

  it('browsing to a different, non-playing episode\'s detail highlights no tab at all', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Episode A'))
    await user.click(await screen.findByText('Play'))
    await user.click(await screen.findByRole('button', { name: 'Episodes' }))
    await user.click(await screen.findByText('Episode B'))
    expect(screen.getByRole('button', { name: 'Playing' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Episodes' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })
})
