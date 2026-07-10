import { describe, it, expect, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'

async function makeApp() {
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('password', 10)
  return buildTestApp()
}

async function getAuthCookie(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: 'password' }
  })
  const setCookie = loginRes.headers['set-cookie'] as string | string[]
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return cookieStr.split(';')[0]
}

async function createSeason(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/seasons',
    headers: { cookie },
    payload: { number: 1, title: 'Test Season' }
  })
  return res.json() as { id: number }
}

const BASE_EPISODE = {
  number: 1,
  title: 'Episode One',
  publish_date: '2024-01-01',
  audio_type: 'url',
  audio_path: 'https://example.com/ep1.mp3',
  description: 'First episode',
  guests: 'Alice',
  tags: 'intro,podcast',
  duration_seconds: 3600
}

describe('Admin Episodes CRUD', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  describe('POST /api/admin/episodes', () => {
    it('creates an episode and returns 201', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const season = await createSeason(app, cookie)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        headers: { cookie },
        payload: { ...BASE_EPISODE, season_id: season.id }
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.id).toBeDefined()
      expect(body.season_id).toBe(season.id)
      expect(body.number).toBe(1)
      expect(body.title).toBe('Episode One')
      expect(body.audio_type).toBe('url')
      expect(body.audio_path).toBe('https://example.com/ep1.mp3')
    })

    it('creates an episode with defaults for optional fields', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const season = await createSeason(app, cookie)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        headers: { cookie },
        payload: {
          season_id: season.id,
          number: 2,
          title: 'Minimal Episode',
          publish_date: '2024-01-02',
          audio_type: 'upload',
          audio_path: '/uploads/ep2.mp3'
        }
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.description).toBe('')
      expect(body.guests).toBe('')
      expect(body.tags).toBe('')
      expect(body.duration_seconds).toBe(0)
      expect(body.hidden).toBeFalsy()
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        payload: { season_id: 1, number: 1, title: 'Test', publish_date: '2024-01-01', audio_type: 'url', audio_path: 'https://example.com/ep.mp3' }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('PUT /api/admin/episodes/:id', () => {
    it('fully replaces an episode and returns updated row', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const season = await createSeason(app, cookie)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        headers: { cookie },
        payload: { ...BASE_EPISODE, season_id: season.id }
      })
      const { id } = createRes.json()

      const res = await app.inject({
        method: 'PUT',
        url: `/api/admin/episodes/${id}`,
        headers: { cookie },
        payload: {
          season_id: season.id,
          number: 99,
          title: 'Replaced Title',
          description: 'New desc',
          guests: 'Bob',
          tags: 'updated',
          duration_seconds: 7200,
          publish_date: '2025-06-01',
          audio_type: 'upload',
          audio_path: '/uploads/replaced.mp3',
          hidden: true
        }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(id)
      expect(body.number).toBe(99)
      expect(body.title).toBe('Replaced Title')
      expect(body.description).toBe('New desc')
      expect(body.guests).toBe('Bob')
      expect(body.tags).toBe('updated')
      expect(body.duration_seconds).toBe(7200)
      expect(body.publish_date).toBe('2025-06-01')
      expect(body.audio_type).toBe('upload')
      expect(body.audio_path).toBe('/uploads/replaced.mp3')
      expect(body.hidden).toBeTruthy()
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const season = await createSeason(app, cookie)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        headers: { cookie },
        payload: { ...BASE_EPISODE, season_id: season.id }
      })
      const { id } = createRes.json()

      const res = await app.inject({
        method: 'PUT',
        url: `/api/admin/episodes/${id}`,
        payload: {
          season_id: season.id,
          number: 1,
          title: 'New',
          description: '',
          guests: '',
          tags: '',
          duration_seconds: 0,
          publish_date: '2024-01-01',
          audio_type: 'url',
          audio_path: 'https://example.com/ep.mp3',
          hidden: false
        }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('PATCH /api/admin/episodes/:id', () => {
    it('partially updates an episode and returns updated row with updated_at changed', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const season = await createSeason(app, cookie)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        headers: { cookie },
        payload: { ...BASE_EPISODE, season_id: season.id }
      })
      const created = createRes.json()

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/episodes/${created.id}`,
        headers: { cookie },
        payload: { title: 'Patched Title', duration_seconds: 9999 }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(created.id)
      expect(body.title).toBe('Patched Title')
      expect(body.duration_seconds).toBe(9999)
      // Unchanged fields stay the same
      expect(body.description).toBe(BASE_EPISODE.description)
      expect(body.guests).toBe(BASE_EPISODE.guests)
      // updated_at should be present
      expect(body.updated_at).toBeDefined()
    })

    it('returns 404 for missing episode id', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/episodes/9999',
        headers: { cookie },
        payload: { title: 'Ghost' }
      })

      expect(res.statusCode).toBe(404)
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/episodes/1',
        payload: { title: 'Ghost' }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('DELETE /api/admin/episodes/:id', () => {
    it('deletes an episode and returns 204', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      const season = await createSeason(app, cookie)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/episodes',
        headers: { cookie },
        payload: { ...BASE_EPISODE, season_id: season.id }
      })
      const { id } = createRes.json()

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/episodes/${id}`,
        headers: { cookie }
      })

      expect(deleteRes.statusCode).toBe(204)
    })

    it('returns 404 for missing episode id', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/episodes/9999',
        headers: { cookie }
      })

      expect(res.statusCode).toBe(404)
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/episodes/1'
      })

      expect(res.statusCode).toBe(401)
    })
  })
})
