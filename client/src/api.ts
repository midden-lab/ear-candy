import type { Settings, Season, Episode } from './types'

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

export const updateSettings = (data: Partial<Settings>) => adminRequest<Settings>('/api/admin/settings', 'PATCH', data)

export const createSeason = (data: Partial<Season>) => adminRequest<Season>('/api/admin/seasons', 'POST', data)
export const updateSeason = (id: number, data: Partial<Season>) => adminRequest<Season>(`/api/admin/seasons/${id}`, 'PATCH', data)
export const deleteSeason = (id: number) => adminRequest<void>(`/api/admin/seasons/${id}`, 'DELETE')

export const createEpisode = (data: Partial<Episode>) => adminRequest<Episode>('/api/admin/episodes', 'POST', data)
export const updateEpisode = (id: number, data: Partial<Episode>) => adminRequest<Episode>(`/api/admin/episodes/${id}`, 'PATCH', data)
export const deleteEpisode = (id: number) => adminRequest<void>(`/api/admin/episodes/${id}`, 'DELETE')

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
