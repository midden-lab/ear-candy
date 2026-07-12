import { vi, beforeEach, describe, it, expect } from 'vitest'
import { getSettings, getSeasons, getEpisodes, getEpisode, login, logout, uploadAudio, uploadEpisodeArt, uploadFavicon } from '../api'
import type { Settings, Season, Episode } from '../types'

const mockSettings: Settings = {
  podcast_name: 'Test Podcast',
  tagline: 'A test tagline',
  description: 'A test description',
  cover_art_path: null,
  favicon_path: null,
  browser_tab_title: null,
  accent_color: '#ff6600',
}

const mockSeason: Season = {
  id: 1,
  number: 1,
  title: 'Season One',
  description: 'The first season',
  cover_art_path: null,
  hidden: false,
  created_at: '2024-01-01T00:00:00Z',
}

const mockEpisode: Episode = {
  id: 5,
  season_id: 1,
  number: 1,
  title: 'Episode Five',
  description: 'Fifth episode',
  guests: '',
  tags: '',
  cover_art_path: null,
  cover_art_thumb_path: null,
  duration_seconds: 1800,
  publish_date: '2024-01-05',
  audio_type: 'upload',
  audio_path: '/audio/ep5.mp3',
  hidden: false,
  created_at: '2024-01-05T00:00:00Z',
  updated_at: '2024-01-05T00:00:00Z',
}

function makeFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('getSettings', () => {
  it('calls /api/settings and returns parsed JSON', async () => {
    const fetchMock = makeFetch(mockSettings)
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSettings()
    expect(fetchMock).toHaveBeenCalledWith('/api/settings')
    expect(result).toEqual(mockSettings)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 500))
    await expect(getSettings()).rejects.toThrow()
  })
})

describe('getSeasons', () => {
  it('calls /api/seasons and returns parsed JSON', async () => {
    const fetchMock = makeFetch([mockSeason])
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSeasons()
    expect(fetchMock).toHaveBeenCalledWith('/api/seasons')
    expect(result).toEqual([mockSeason])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 404))
    await expect(getSeasons()).rejects.toThrow()
  })
})

describe('getEpisodes', () => {
  it('calls /api/episodes with no season_id when called without argument', async () => {
    const fetchMock = makeFetch([mockEpisode])
    vi.stubGlobal('fetch', fetchMock)

    const result = await getEpisodes()
    expect(fetchMock).toHaveBeenCalledWith('/api/episodes')
    expect(result).toEqual([mockEpisode])
  })

  it('appends ?season_id=N when called with a season id', async () => {
    const fetchMock = makeFetch([mockEpisode])
    vi.stubGlobal('fetch', fetchMock)

    await getEpisodes(3)
    expect(fetchMock).toHaveBeenCalledWith('/api/episodes?season_id=3')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 500))
    await expect(getEpisodes()).rejects.toThrow()
  })
})

describe('getEpisode', () => {
  it('calls /api/episodes/:id and returns parsed JSON', async () => {
    const fetchMock = makeFetch(mockEpisode)
    vi.stubGlobal('fetch', fetchMock)

    const result = await getEpisode(5)
    expect(fetchMock).toHaveBeenCalledWith('/api/episodes/5')
    expect(result).toEqual(mockEpisode)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 404))
    await expect(getEpisode(99)).rejects.toThrow()
  })
})

describe('login', () => {
  it('login posts to /api/admin/login and throws on non-ok', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    await login('password')
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/login', expect.objectContaining({ method: 'POST' }))

    mockFetch.mockResolvedValueOnce({ ok: false } as Response)
    await expect(login('wrong')).rejects.toThrow('Invalid password')
  })
})

describe('logout', () => {
  it('posts to /api/admin/logout with credentials included', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response)
    vi.stubGlobal('fetch', mockFetch)

    await logout()

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
    })
  })
})

describe('uploadAudio', () => {
  it('posts FormData to /api/admin/upload with credentials and returns path', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ path: '/audio/test-123.mp3' }),
    } as Response)

    const file = new File(['fake audio'], 'test.mp3', { type: 'audio/mpeg' })
    const result = await uploadAudio(file)

    expect(result).toEqual({ path: '/audio/test-123.mp3' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/upload')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 500))
    const file = new File(['fake audio'], 'test.mp3', { type: 'audio/mpeg' })
    await expect(uploadAudio(file)).rejects.toThrow('Upload failed: HTTP 500')
  })
})

describe('uploadEpisodeArt', () => {
  it('posts FormData to /api/admin/upload/image with credentials and returns thumb/detail', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ thumb: '/images/abc-thumb.webp', detail: '/images/abc-detail.webp' }),
    } as Response)

    const file = new File(['fake image'], 'cover.jpg', { type: 'image/jpeg' })
    const result = await uploadEpisodeArt(file)

    expect(result).toEqual({ thumb: '/images/abc-thumb.webp', detail: '/images/abc-detail.webp' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/upload/image')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 500))
    const file = new File(['fake image'], 'cover.jpg', { type: 'image/jpeg' })
    await expect(uploadEpisodeArt(file)).rejects.toThrow('Upload failed: HTTP 500')
  })
})

describe('uploadFavicon', () => {
  it('posts FormData to /api/admin/upload/favicon with credentials and returns path', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ path: '/images/favicon-abc.png' }),
    } as Response)

    const file = new File(['fake favicon'], 'favicon.png', { type: 'image/png' })
    const result = await uploadFavicon(file)

    expect(result).toEqual({ path: '/images/favicon-abc.png' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/upload/favicon')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(null, false, 500))
    const file = new File(['fake favicon'], 'favicon.png', { type: 'image/png' })
    await expect(uploadFavicon(file)).rejects.toThrow('Upload failed: HTTP 500')
  })
})
