import type { Settings, Season, Episode, AnalyticsOverview, AnalyticsEpisodeStat, AnalyticsBreakdowns } from './types'

async function adminRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// The public getSettings() (below, via request()) deliberately omits
// fields an unauthenticated caller shouldn't see (session_epoch,
// excluded_analytics_ips) — the admin Settings page must read its own
// current values from this authenticated route instead, or a saved
// excluded_analytics_ips value silently never reappears after a reload.
export const getAdminSettings = () => adminRequest<Settings>('/api/admin/settings', 'GET')
export const updateSettings = (data: Partial<Settings>) => adminRequest<Settings>('/api/admin/settings', 'PATCH', data)
export const getMyIp = () => adminRequest<{ ip: string }>('/api/admin/my-ip', 'GET')

export const createSeason = (data: Partial<Season>) => adminRequest<Season>('/api/admin/seasons', 'POST', data)
export const updateSeason = (id: number, data: Partial<Season>) => adminRequest<Season>(`/api/admin/seasons/${id}`, 'PATCH', data)
export const deleteSeason = (id: number) => adminRequest<void>(`/api/admin/seasons/${id}`, 'DELETE')

export const createEpisode = (data: Partial<Episode>) => adminRequest<Episode>('/api/admin/episodes', 'POST', data)
export const updateEpisode = (id: number, data: Partial<Episode>) => adminRequest<Episode>(`/api/admin/episodes/${id}`, 'PATCH', data)
export const deleteEpisode = (id: number) => adminRequest<void>(`/api/admin/episodes/${id}`, 'DELETE')

export const getAnalyticsOverview = (days = 30) => adminRequest<AnalyticsOverview>(`/api/admin/analytics/overview?days=${days}`, 'GET')
export const getAnalyticsEpisodeStats = () => adminRequest<AnalyticsEpisodeStat[]>('/api/admin/analytics/episodes', 'GET')
export const getAnalyticsBreakdowns = (days = 30) => adminRequest<AnalyticsBreakdowns>(`/api/admin/analytics/breakdowns?days=${days}`, 'GET')

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`)
  }
  return res.json() as Promise<T>
}

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings')
}

export function getSeasons(): Promise<Season[]> {
  return request<Season[]>('/api/seasons')
}

export function getEpisodes(seasonId?: number): Promise<Episode[]> {
  const url = seasonId !== undefined
    ? `/api/episodes?season_id=${seasonId}`
    : '/api/episodes'
  return request<Episode[]>(url)
}

export function getEpisode(id: number): Promise<Episode> {
  return request<Episode>(`/api/episodes/${id}`)
}

export async function login(password: string): Promise<void> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Invalid password')
}

export async function logout(): Promise<void> {
  await fetch('/api/admin/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function uploadAudio(file: File): Promise<{ path: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ path: string }>
}

export async function uploadEpisodeArt(file: File): Promise<{ thumb: string; detail: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/upload/image', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ thumb: string; detail: string }>
}

export async function uploadFavicon(file: File): Promise<{ path: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/upload/favicon', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ path: string }>
}
