import { describe, it, expect, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'

// Security audit M4/L1 (plan 020 step 7): admin write routes used to 500 on
// missing fields (title.trim() on undefined) and silently accept wrong types
// (number: "x" -> 201, accent_color: any string). Limits below are >= 2x the
// largest values found in production on 2026-11-21 (title 46, text 774,
// season title 8, numbers <= 32) so editing any existing row still works.

async function makeApp() {
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('password', 10)
  return buildTestApp()
}

async function cookieFor(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const res = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'password' } })
  const sc = res.headers['set-cookie'] as string | string[]
  return (Array.isArray(sc) ? sc[0] : sc).split(';')[0]
}

type App = Awaited<ReturnType<typeof makeApp>>

async function seedSeason(app: App, cookie: string) {
  const res = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number: 1, title: 'S1' } })
  return (res.json() as { id: number }).id
}

const VALID_EPISODE = (season_id: number) => ({
  season_id, number: 1, title: 'Ep', publish_date: '2024-01-15',
  audio_type: 'url', audio_path: 'https://example.com/a.mp3',
})

describe('admin write-route validation', () => {
  afterEach(() => { delete process.env.ADMIN_PASSWORD_HASH })

  describe('POST /api/admin/seasons', () => {
    it('400s (was 500) when title is missing or not a string', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app)
      for (const payload of [{ number: 1 }, { number: 1, title: 5 }, { number: 1, title: null }, { number: 1, title: ['a'] }]) {
        const res = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(400)
      }
    })

    it('400s (was 201) when number is not an integer in range', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app)
      for (const number of ['x', '1', 1.5, -1, 1_000_001, null, {}]) {
        const res = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number, title: 'S' } })
        expect(res.statusCode, String(number)).toBe(400)
        expect(res.json()).toEqual({ error: 'number is invalid' })
      }
      const rows = app.db.prepare('SELECT COUNT(*) AS c FROM seasons').get() as { c: number }
      expect(rows.c).toBe(0)
    })

    it('400s on an over-long title or description, and still 400s blank titles', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app)
      const long = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number: 1, title: 'x'.repeat(301) } })
      expect(long.statusCode).toBe(400)
      const longDesc = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number: 1, title: 'S', description: 'x'.repeat(10_001) } })
      expect(longDesc.statusCode).toBe(400)
      const blank = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number: 1, title: '   ' } })
      expect(blank.statusCode).toBe(400)
    })

    it('still accepts a normal season (what the client and e2e fixtures send)', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app)
      const res = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number: 1, title: 'Season 1' } })
      expect(res.statusCode).toBe(201)
      const edge = await app.inject({ method: 'POST', url: '/api/admin/seasons', headers: { cookie }, payload: { number: 0, title: 'x'.repeat(300), description: 'y'.repeat(10_000) } })
      expect(edge.statusCode).toBe(201)
    })
  })

  describe('PUT/PATCH /api/admin/seasons/:id', () => {
    it('400s on a bad number or non-string title instead of 500/accepting it', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app); const id = await seedSeason(app, cookie)
      const put = await app.inject({ method: 'PUT', url: `/api/admin/seasons/${id}`, headers: { cookie }, payload: { number: 'x', title: 'S' } })
      expect(put.statusCode).toBe(400)
      const putNoTitle = await app.inject({ method: 'PUT', url: `/api/admin/seasons/${id}`, headers: { cookie }, payload: { number: 1 } })
      expect(putNoTitle.statusCode).toBe(400)
      const patchNum = await app.inject({ method: 'PATCH', url: `/api/admin/seasons/${id}`, headers: { cookie }, payload: { number: 'x' } })
      expect(patchNum.statusCode).toBe(400)
      const patchTitle = await app.inject({ method: 'PATCH', url: `/api/admin/seasons/${id}`, headers: { cookie }, payload: { title: null } })
      expect(patchTitle.statusCode).toBe(400)
      const ok = await app.inject({ method: 'PATCH', url: `/api/admin/seasons/${id}`, headers: { cookie }, payload: { title: 'Renamed', number: 2 } })
      expect(ok.statusCode).toBe(200)
    })
  })

  describe('POST /api/admin/episodes', () => {
    it('400s (was 500) when title is missing, and on wrong-typed core fields', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app); const sid = await seedSeason(app, cookie)
      const bad: Array<Record<string, unknown>> = [
        { ...VALID_EPISODE(sid), title: undefined },
        { ...VALID_EPISODE(sid), title: 7 },
        { ...VALID_EPISODE(sid), number: 'x' },
        { ...VALID_EPISODE(sid), season_id: { id: 1 } },
        { ...VALID_EPISODE(sid), season_id: '1' },
        { ...VALID_EPISODE(sid), publish_date: 20240115 },
        { ...VALID_EPISODE(sid), description: { a: 1 } },
        { ...VALID_EPISODE(sid), guests: 5 },
        { ...VALID_EPISODE(sid), tags: ['a'] },
        { ...VALID_EPISODE(sid), description: 'x'.repeat(10_001) },
        { ...VALID_EPISODE(sid), duration_seconds: 'abc' },
      ]
      for (const payload of bad) {
        const res = await app.inject({ method: 'POST', url: '/api/admin/episodes', headers: { cookie }, payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(400)
      }
      const count = app.db.prepare('SELECT COUNT(*) AS c FROM episodes').get() as { c: number }
      expect(count.c).toBe(0)
    })

    it('keeps existing behaviour: negative duration and unknown season are still 400 with their messages', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app); const sid = await seedSeason(app, cookie)
      const neg = await app.inject({ method: 'POST', url: '/api/admin/episodes', headers: { cookie }, payload: { ...VALID_EPISODE(sid), duration_seconds: -5 } })
      expect(neg.statusCode).toBe(400)
      expect(neg.json()).toEqual({ error: 'duration_seconds must not be negative' })
      const noSeason = await app.inject({ method: 'POST', url: '/api/admin/episodes', headers: { cookie }, payload: VALID_EPISODE(99999) })
      expect(noSeason.statusCode).toBe(400)
      expect(noSeason.json()).toEqual({ error: 'season_id does not reference an existing season' })
    })

    it('still accepts what the client and e2e fixtures send', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app); const sid = await seedSeason(app, cookie)
      const res = await app.inject({
        method: 'POST', url: '/api/admin/episodes', headers: { cookie },
        payload: { ...VALID_EPISODE(sid), description: 'd', guests: 'g', tags: 't', duration_seconds: 1234, hidden: false },
      })
      expect(res.statusCode).toBe(201)
    })
  })

  describe('PUT/PATCH /api/admin/episodes/:id', () => {
    it('400s on wrong types and over-long text, accepts valid edits', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app); const sid = await seedSeason(app, cookie)
      const created = await app.inject({ method: 'POST', url: '/api/admin/episodes', headers: { cookie }, payload: VALID_EPISODE(sid) })
      const id = (created.json() as { id: number }).id

      for (const payload of [{ title: null }, { number: 'x' }, { season_id: {} }, { publish_date: 5 }, { tags: 5 }, { description: 'x'.repeat(10_001) }, { duration_seconds: 'x' }]) {
        const res = await app.inject({ method: 'PATCH', url: `/api/admin/episodes/${id}`, headers: { cookie }, payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(400)
      }
      const put = await app.inject({ method: 'PUT', url: `/api/admin/episodes/${id}`, headers: { cookie }, payload: { ...VALID_EPISODE(sid), title: undefined } })
      expect(put.statusCode).toBe(400)

      const ok = await app.inject({ method: 'PATCH', url: `/api/admin/episodes/${id}`, headers: { cookie }, payload: { title: 'Edited', number: 2, hidden: true, season_id: sid } })
      expect(ok.statusCode).toBe(200)
    })
  })

  describe('settings accent_color (L1) and required fields', () => {
    it('PATCH rejects a non-#rrggbb accent_color and accepts a valid one', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app)
      for (const accent_color of ['red;}body{x', '#fff', 'red', '#5a3ef5;', 123, null]) {
        const res = await app.inject({ method: 'PATCH', url: '/api/admin/settings', headers: { cookie }, payload: { accent_color } })
        expect(res.statusCode, String(accent_color)).toBe(400)
        expect(res.json()).toEqual({ error: 'accent_color is invalid' })
      }
      const ok = await app.inject({ method: 'PATCH', url: '/api/admin/settings', headers: { cookie }, payload: { accent_color: '#5a3ef5' } })
      expect(ok.statusCode).toBe(200)
      const upper = await app.inject({ method: 'PATCH', url: '/api/admin/settings', headers: { cookie }, payload: { accent_color: '#9437FF' } })
      expect(upper.statusCode).toBe(200)
    })

    it('PUT rejects a bad or missing accent_color and a missing podcast_name (400, not 500) and leaves the row alone', async () => {
      const app = await makeApp(); const cookie = await cookieFor(app)
      const before = app.db.prepare('SELECT podcast_name, accent_color FROM settings').get()
      const base = { podcast_name: 'P', tagline: 't', description: 'd', accent_color: '#112233' }
      const cases: Array<Record<string, unknown>> = [
        { ...base, accent_color: 'red;}body{x' },
        { ...base, accent_color: undefined },
        { ...base, podcast_name: undefined },
        { ...base, podcast_name: 5 },
      ]
      for (const payload of cases) {
        const res = await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { cookie }, payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(400)
      }
      expect(app.db.prepare('SELECT podcast_name, accent_color FROM settings').get()).toEqual(before)
      const ok = await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { cookie }, payload: base })
      expect(ok.statusCode).toBe(200)
    })
  })
})
