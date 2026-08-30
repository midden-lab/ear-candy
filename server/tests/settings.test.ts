import { describe, it, expect } from 'vitest'
import { buildTestDb } from './helpers.js'
import { runMigrations } from '../src/db/migrate.js'
import { parseDuration, formatDuration } from '../src/utils/duration.js'
import { buildTestApp } from './helpers.js'

describe('database migrations', () => {
  it('seeds a default settings row on first init', () => {
    const db = buildTestDb()
    const row = db.prepare('SELECT * FROM settings').get() as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.accent_color).toBe('#5a3ef5')
    expect(row.podcast_name).toBe('Ear Candy')
  })

  it('does not duplicate settings row on second init', () => {
    const db = buildTestDb()
    runMigrations(db)
    const { c } = db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }
    expect(c).toBe(1)
  })
})

describe('duration utils', () => {
  it('parseDuration converts mm:ss to seconds', () => {
    expect(parseDuration('48:30')).toBe(2910)
    expect(parseDuration('1:02:03')).toBe(3723)
    expect(parseDuration('0:00')).toBe(0)
  })

  it('formatDuration converts seconds to mm:ss', () => {
    expect(formatDuration(2910)).toBe('48:30')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatDuration(90)).toBe('1:30')
  })
})

describe('GET /api/settings', () => {
  it('returns the default settings', async () => {
    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/settings' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.podcast_name).toBe('Ear Candy')
    expect(body.accent_color).toBe('#5a3ef5')
  })

  it('never exposes the internal session_epoch counter to this public, unauthenticated endpoint', async () => {
    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/settings' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).not.toHaveProperty('session_epoch')
  })
})
