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

describe('Admin Seasons CRUD', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  describe('POST /api/admin/seasons', () => {
    it('creates a season and returns 201', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 1, title: 'Season One', description: 'First season' }
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.id).toBeDefined()
      expect(body.number).toBe(1)
      expect(body.title).toBe('Season One')
      expect(body.description).toBe('First season')
    })

    it('creates a season with defaults for optional fields', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 2, title: 'Season Two' }
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.description).toBe('')
      expect(body.hidden).toBeFalsy()
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        payload: { number: 1, title: 'Season One' }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('PUT /api/admin/seasons/:id', () => {
    it('fully replaces a season and returns updated row', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 1, title: 'Original Title', description: 'Original desc' }
      })
      const { id } = createRes.json()

      const res = await app.inject({
        method: 'PUT',
        url: `/api/admin/seasons/${id}`,
        headers: { cookie },
        payload: { number: 2, title: 'Updated Title', description: 'Updated desc', hidden: true }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(id)
      expect(body.number).toBe(2)
      expect(body.title).toBe('Updated Title')
      expect(body.description).toBe('Updated desc')
      expect(body.hidden).toBeTruthy()
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 1, title: 'Season' }
      })
      const { id } = createRes.json()

      const res = await app.inject({
        method: 'PUT',
        url: `/api/admin/seasons/${id}`,
        payload: { number: 1, title: 'New Title', description: '' }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('PATCH /api/admin/seasons/:id', () => {
    it('partially updates a season and returns updated row', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 1, title: 'Original Title', description: 'Original desc' }
      })
      const { id } = createRes.json()

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/seasons/${id}`,
        headers: { cookie },
        payload: { title: 'Patched Title' }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(id)
      expect(body.title).toBe('Patched Title')
      expect(body.description).toBe('Original desc')
      expect(body.number).toBe(1)
    })

    it('returns 404 for missing season id', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/seasons/9999',
        headers: { cookie },
        payload: { title: 'Ghost' }
      })

      expect(res.statusCode).toBe(404)
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/seasons/1',
        payload: { title: 'Ghost' }
      })

      expect(res.statusCode).toBe(401)
    })

    it('rejects a PATCH body containing a field not in the allowlist (SQL injection guard)', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 1, title: 'Original Title' }
      })
      const { id } = createRes.json()

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/seasons/${id}`,
        headers: { cookie },
        payload: { 'title; DROP TABLE seasons; --': 'pwned' }
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('DELETE /api/admin/seasons/:id', () => {
    it('deletes a season and returns 204', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/seasons',
        headers: { cookie },
        payload: { number: 1, title: 'To Delete' }
      })
      const { id } = createRes.json()

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/seasons/${id}`,
        headers: { cookie }
      })

      expect(deleteRes.statusCode).toBe(204)

      // Verify it's gone
      const getRes = await app.inject({
        method: 'GET',
        url: '/api/seasons'
      })
      const seasons = getRes.json()
      expect(seasons.find((s: { id: number }) => s.id === id)).toBeUndefined()
    })

    it('returns 404 for missing season id', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/seasons/9999',
        headers: { cookie }
      })

      expect(res.statusCode).toBe(404)
    })

    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/seasons/1'
      })

      expect(res.statusCode).toBe(401)
    })
  })
})
