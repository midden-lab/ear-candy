import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestApp } from './helpers.js'
import { __resetGeoipCacheForTests } from '../src/utils/geoip.js'

function seedEpisode(app: ReturnType<typeof buildTestApp>) {
  const s = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (1,'S1')`).run()
  const e = app.db.prepare(`
    INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden)
    VALUES (?,1,'Ep One','2024-01-01','url','https://example.com/1.mp3',0)
  `).run(s.lastInsertRowid)
  return { seasonId: s.lastInsertRowid as number, episodeId: e.lastInsertRowid as number }
}

function countEvents(app: ReturnType<typeof buildTestApp>): number {
  return (app.db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c
}

const KNOWN_CRAWLER_UA = 'Twitterbot/1.0'
const REAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

describe('POST /api/analytics/event', () => {
  beforeEach(() => {
    __resetGeoipCacheForTests()
    delete process.env.GEOIP_DB_PATH
  })
  afterEach(() => {
    __resetGeoipCacheForTests()
  })

  it('inserts a page_view row for a valid payload', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'page_view', session_id: 'sess-1', referrer: 'https://example.com/' },
    })
    expect(res.statusCode).toBe(204)
    expect(countEvents(app)).toBe(1)
    const row = app.db.prepare('SELECT * FROM events').get() as Record<string, unknown>
    expect(row.event_type).toBe('page_view')
    expect(row.session_id).toBe('sess-1')
    expect(row.referrer).toBe('https://example.com/')
    expect(row.device_type).toBe('desktop')
    expect(row.browser).toBe('Chrome')
  })

  it('inserts a play_start row referencing a real episode/season', async () => {
    const app = buildTestApp()
    const { seasonId, episodeId } = seedEpisode(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'play_start', session_id: 'sess-1', episode_id: episodeId, season_id: seasonId },
    })
    expect(res.statusCode).toBe(204)
    const row = app.db.prepare('SELECT * FROM events').get() as Record<string, unknown>
    expect(row.event_type).toBe('play_start')
    expect(row.episode_id).toBe(episodeId)
    expect(row.season_id).toBe(seasonId)
  })

  it('inserts a listen_progress row with position_pct', async () => {
    const app = buildTestApp()
    const { seasonId, episodeId } = seedEpisode(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'listen_progress', session_id: 'sess-1', episode_id: episodeId, season_id: seasonId, position_pct: 50 },
    })
    expect(res.statusCode).toBe(204)
    const row = app.db.prepare('SELECT * FROM events').get() as Record<string, unknown>
    expect(row.position_pct).toBe(50)
  })

  it('inserts a play_complete row', async () => {
    const app = buildTestApp()
    const { seasonId, episodeId } = seedEpisode(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'play_complete', session_id: 'sess-1', episode_id: episodeId, season_id: seasonId },
    })
    expect(res.statusCode).toBe(204)
    const row = app.db.prepare('SELECT * FROM events').get() as Record<string, unknown>
    expect(row.event_type).toBe('play_complete')
  })

  describe('shape validation', () => {
    it('rejects an unknown event_type with 400 and writes nothing', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'bogus', session_id: 'sess-1' },
      })
      expect(res.statusCode).toBe(400)
      expect(countEvents(app)).toBe(0)
    })

    it('rejects an out-of-range position_pct with 400 and writes nothing', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'listen_progress', session_id: 'sess-1', position_pct: 33 },
      })
      expect(res.statusCode).toBe(400)
      expect(countEvents(app)).toBe(0)
    })

    it('rejects a non-integer episode_id with 400 and writes nothing', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'play_start', session_id: 'sess-1', episode_id: 1.5 },
      })
      expect(res.statusCode).toBe(400)
      expect(countEvents(app)).toBe(0)
    })

    it('rejects an oversized referrer with 400 and writes nothing', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'page_view', session_id: 'sess-1', referrer: 'x'.repeat(501) },
      })
      expect(res.statusCode).toBe(400)
      expect(countEvents(app)).toBe(0)
    })

    it('rejects a referrer just over the 200-char cap, accepts one right at it', async () => {
      const app = buildTestApp()
      const tooLong = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'page_view', session_id: 'sess-1', referrer: 'x'.repeat(201) },
      })
      expect(tooLong.statusCode).toBe(400)
      expect(countEvents(app)).toBe(0)

      const atLimit = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'page_view', session_id: 'sess-2', referrer: 'x'.repeat(200) },
      })
      expect(atLimit.statusCode).toBe(204)
      expect(countEvents(app)).toBe(1)
    })

    it('rejects a missing session_id with 400', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'page_view' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects a body larger than the body limit before reaching the handler', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        payload: { event_type: 'page_view', session_id: 'sess-1', referrer: 'x'.repeat(10000) },
      })
      expect(res.statusCode).toBe(413)
      expect(countEvents(app)).toBe(0)
    })
  })

  it('an episode_id that does not exist still returns 204 (identical shape to a valid one) and inserts with episode_id NULL', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'play_start', session_id: 'sess-1', episode_id: 999999 },
    })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
    const row = app.db.prepare('SELECT * FROM events').get() as Record<string, unknown>
    expect(row.episode_id).toBeNull()
  })

  it('does not write anything when analytics_enabled is 0, but still returns 204', async () => {
    const app = buildTestApp()
    app.db.prepare('UPDATE settings SET analytics_enabled = 0').run()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'page_view', session_id: 'sess-1' },
    })
    expect(res.statusCode).toBe(204)
    expect(countEvents(app)).toBe(0)
  })

  it('does not write anything for a known-crawler User-Agent, but still returns 204', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': KNOWN_CRAWLER_UA },
      payload: { event_type: 'page_view', session_id: 'sess-1' },
    })
    expect(res.statusCode).toBe(204)
    expect(countEvents(app)).toBe(0)
  })

  describe('excluded IPs', () => {
    it('does not write anything for a request from an excluded IP, but still returns 204', async () => {
      const app = buildTestApp()
      app.db.prepare('UPDATE settings SET excluded_analytics_ips = ?').run('203.0.113.5, 198.51.100.9')
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'page_view', session_id: 'sess-1' },
        remoteAddress: '203.0.113.5',
      })
      expect(res.statusCode).toBe(204)
      expect(countEvents(app)).toBe(0)
    })

    it('still writes for a non-excluded IP when the exclusion list is set', async () => {
      const app = buildTestApp()
      app.db.prepare('UPDATE settings SET excluded_analytics_ips = ?').run('203.0.113.5')
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'page_view', session_id: 'sess-1' },
        remoteAddress: '198.51.100.9',
      })
      expect(res.statusCode).toBe(204)
      expect(countEvents(app)).toBe(1)
    })

    it('excludes play_start events too, not just page_view', async () => {
      const app = buildTestApp()
      const { episodeId } = seedEpisode(app)
      app.db.prepare('UPDATE settings SET excluded_analytics_ips = ?').run('203.0.113.5')
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'play_start', session_id: 'sess-1', episode_id: episodeId },
        remoteAddress: '203.0.113.5',
      })
      expect(res.statusCode).toBe(204)
      expect(countEvents(app)).toBe(0)
    })

    it('matches an IPv4-mapped-IPv6 request address against a plain IPv4 entry in the stored list', async () => {
      const app = buildTestApp()
      app.db.prepare('UPDATE settings SET excluded_analytics_ips = ?').run('203.0.113.5')
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'page_view', session_id: 'sess-1' },
        remoteAddress: '::ffff:203.0.113.5',
      })
      expect(res.statusCode).toBe(204)
      expect(countEvents(app)).toBe(0)
    })

    it('is a no-op when excluded_analytics_ips is NULL (the default)', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'page_view', session_id: 'sess-1' },
        remoteAddress: '203.0.113.5',
      })
      expect(res.statusCode).toBe(204)
      expect(countEvents(app)).toBe(1)
    })
  })

  it('debounces duplicate (session_id, event_type, episode_id) submissions within the dedup window', async () => {
    const app = buildTestApp()
    const { episodeId } = seedEpisode(app)
    const payload = { event_type: 'play_start', session_id: 'sess-dup', episode_id: episodeId }
    await app.inject({ method: 'POST', url: '/api/analytics/event', headers: { 'user-agent': REAL_UA }, payload })
    await app.inject({ method: 'POST', url: '/api/analytics/event', headers: { 'user-agent': REAL_UA }, payload })
    expect(countEvents(app)).toBe(1)
  })

  it('does not debounce across different session ids', async () => {
    const app = buildTestApp()
    const { episodeId } = seedEpisode(app)
    await app.inject({
      method: 'POST', url: '/api/analytics/event', headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'play_start', session_id: 'sess-a', episode_id: episodeId },
    })
    await app.inject({
      method: 'POST', url: '/api/analytics/event', headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'play_start', session_id: 'sess-b', episode_id: episodeId },
    })
    expect(countEvents(app)).toBe(2)
  })

  it('rate-limits after 120 requests/minute from the same caller, independent of the global 1000/min limit', async () => {
    const app = buildTestApp()
    for (let i = 0; i < 120; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/event',
        headers: { 'user-agent': REAL_UA },
        payload: { event_type: 'page_view', session_id: `sess-${i}` },
      })
      expect(res.statusCode).toBe(204)
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/analytics/event',
      headers: { 'user-agent': REAL_UA },
      payload: { event_type: 'page_view', session_id: 'sess-over-limit' },
    })
    expect(limited.statusCode).toBe(429)
  })
})
