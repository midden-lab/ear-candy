import { describe, it, expect, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'

async function makeApp() {
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('password', 10)
  return buildTestApp()
}

async function getAuthCookie(app: ReturnType<typeof buildTestApp>) {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: 'password' },
  })
  const setCookie = loginRes.headers['set-cookie'] as string | string[]
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return cookieStr.split(';')[0]
}

function seedEpisode(app: ReturnType<typeof buildTestApp>, title = 'Ep One') {
  const s = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (1,'S1')`).run()
  const e = app.db.prepare(`
    INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden)
    VALUES (?,1,?,'2024-01-01','url','https://example.com/1.mp3',0)
  `).run(s.lastInsertRowid, title)
  return { seasonId: s.lastInsertRowid as number, episodeId: e.lastInsertRowid as number }
}

function insertEvent(
  app: ReturnType<typeof buildTestApp>,
  fields: Partial<{
    event_type: string; episode_id: number | null; season_id: number | null
    session_id: string; position_pct: number | null; referrer: string | null
    country: string | null; device_type: string | null; os: string | null; browser: string | null
    created_at: string
  }>
) {
  const f = {
    event_type: 'page_view',
    episode_id: null,
    season_id: null,
    session_id: 'sess-default',
    position_pct: null,
    referrer: null,
    country: null,
    device_type: null,
    os: null,
    browser: null,
    created_at: null as string | null,
    ...fields,
  }
  if (f.created_at) {
    app.db.prepare(`
      INSERT INTO events (event_type, episode_id, season_id, session_id, position_pct, referrer, country, device_type, os, browser, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(f.event_type, f.episode_id, f.season_id, f.session_id, f.position_pct, f.referrer, f.country, f.device_type, f.os, f.browser, f.created_at)
  } else {
    app.db.prepare(`
      INSERT INTO events (event_type, episode_id, season_id, session_id, position_pct, referrer, country, device_type, os, browser)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(f.event_type, f.episode_id, f.season_id, f.session_id, f.position_pct, f.referrer, f.country, f.device_type, f.os, f.browser)
  }
}

describe('Admin analytics endpoints', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  describe('authentication', () => {
    it('GET /admin/analytics/overview returns 401 without a valid session', async () => {
      const app = buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/overview' })
      expect(res.statusCode).toBe(401)
    })

    it('GET /admin/analytics/episodes returns 401 without a valid session', async () => {
      const app = buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/episodes' })
      expect(res.statusCode).toBe(401)
    })

    it('GET /admin/analytics/breakdowns returns 401 without a valid session', async () => {
      const app = buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/breakdowns' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /admin/analytics/overview', () => {
    it('counts events inside the window and excludes events outside it', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const inWindow = (app.db.prepare("SELECT datetime('now', '-5 days') as ts").get() as { ts: string }).ts
      const outOfWindow = (app.db.prepare("SELECT datetime('now', '-40 days') as ts").get() as { ts: string }).ts

      insertEvent(app, { event_type: 'page_view', session_id: 's-in', created_at: inWindow })
      insertEvent(app, { event_type: 'page_view', session_id: 's-out', created_at: outOfWindow })

      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/overview?days=30', headers: { cookie } })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.totalPageViews).toBe(1)
      expect(body.uniqueSessions).toBe(1)
    })

    it('splits sessions into new vs. returning based on each session\'s all-time first event', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const old = (app.db.prepare("SELECT datetime('now', '-40 days') as ts").get() as { ts: string }).ts
      const recent = (app.db.prepare("SELECT datetime('now', '-2 days') as ts").get() as { ts: string }).ts

      // "returning" session: has an event before the 30-day window, and another inside it.
      insertEvent(app, { event_type: 'page_view', session_id: 'returning-sess', created_at: old })
      insertEvent(app, { event_type: 'page_view', session_id: 'returning-sess', created_at: recent })
      // "new" session: only has events inside the window.
      insertEvent(app, { event_type: 'page_view', session_id: 'new-sess', created_at: recent })

      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/overview?days=30', headers: { cookie } })
      const body = res.json()
      expect(body.returningSessions).toBe(1)
      expect(body.newSessions).toBe(1)
    })

    it('rejects an invalid days parameter', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/overview?days=notanumber', headers: { cookie } })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /admin/analytics/episodes', () => {
    it('computes completion_rate correctly, including the zero-play_starts case', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const { episodeId: ep1 } = seedEpisode(app, 'Episode With Plays')
      const { episodeId: ep2 } = seedEpisode(app, 'Episode With Only A Completion')

      insertEvent(app, { event_type: 'play_start', episode_id: ep1, session_id: 's1' })
      insertEvent(app, { event_type: 'play_start', episode_id: ep1, session_id: 's2' })
      insertEvent(app, { event_type: 'play_complete', episode_id: ep1, session_id: 's1' })
      // No play_start for ep2, only a play_complete — division by zero must not throw/NaN.
      insertEvent(app, { event_type: 'play_complete', episode_id: ep2, session_id: 's3' })

      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/episodes', headers: { cookie } })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { episode_id: number; play_starts: number; play_completes: number; completion_rate: number }[]

      const stat1 = body.find(r => r.episode_id === ep1)!
      expect(stat1.play_starts).toBe(2)
      expect(stat1.play_completes).toBe(1)
      expect(stat1.completion_rate).toBe(0.5)

      const stat2 = body.find(r => r.episode_id === ep2)!
      expect(stat2.play_starts).toBe(0)
      expect(stat2.completion_rate).toBe(0)
    })

    it('omits episodes with no events entirely', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      seedEpisode(app, 'Never Played')

      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/episodes', headers: { cookie } })
      expect(res.json()).toEqual([])
    })

    it('counts listen_progress milestones per episode', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const { episodeId } = seedEpisode(app)
      insertEvent(app, { event_type: 'listen_progress', episode_id: episodeId, position_pct: 25, session_id: 's1' })
      insertEvent(app, { event_type: 'listen_progress', episode_id: episodeId, position_pct: 25, session_id: 's2' })
      insertEvent(app, { event_type: 'listen_progress', episode_id: episodeId, position_pct: 90, session_id: 's1' })

      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/episodes', headers: { cookie } })
      const body = res.json() as { milestone_25: number; milestone_50: number; milestone_90: number }[]
      expect(body[0].milestone_25).toBe(2)
      expect(body[0].milestone_50).toBe(0)
      expect(body[0].milestone_90).toBe(1)
    })
  })

  describe('GET /admin/analytics/breakdowns', () => {
    it('only counts page_view events, excludes NULL values, sorted by count descending', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      insertEvent(app, { event_type: 'page_view', country: 'US', session_id: 's1' })
      insertEvent(app, { event_type: 'page_view', country: 'US', session_id: 's2' })
      insertEvent(app, { event_type: 'page_view', country: 'CA', session_id: 's3' })
      insertEvent(app, { event_type: 'page_view', country: null, session_id: 's4' })
      // play_start with a country set must NOT be counted in the breakdown — only page_view.
      insertEvent(app, { event_type: 'play_start', country: 'GB', session_id: 's5' })

      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/breakdowns', headers: { cookie } })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { countries: { key: string; count: number }[] }
      expect(body.countries).toEqual([
        { key: 'US', count: 2 },
        { key: 'CA', count: 1 },
      ])
    })

    it('rejects an invalid days parameter', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const res = await app.inject({ method: 'GET', url: '/api/admin/analytics/breakdowns?days=-5', headers: { cookie } })
      expect(res.statusCode).toBe(400)
    })
  })
})
