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

describe('Admin Settings routes', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  describe('PUT /api/admin/settings', () => {
    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        payload: {
          podcast_name: 'Test',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#ffffff'
        }
      })
      expect(res.statusCode).toBe(401)
    })

    it('updates all fields and returns full settings object', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const payload = {
        podcast_name: 'My Awesome Podcast',
        tagline: 'The best podcast ever',
        description: 'We talk about stuff',
        cover_art_path: '/audio/cover.jpg',
        accent_color: '#ff0000'
      }

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.podcast_name).toBe('My Awesome Podcast')
      expect(body.tagline).toBe('The best podcast ever')
      expect(body.description).toBe('We talk about stuff')
      expect(body.cover_art_path).toBe('/audio/cover.jpg')
      expect(body.accent_color).toBe('#ff0000')
    })

    it('sets cover_art_path to null when not provided', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Nulled Art',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.cover_art_path).toBeNull()
    })

    it('accepts a valid /images/ path for favicon_path', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Faviconed',
          tagline: '',
          description: '',
          cover_art_path: null,
          favicon_path: '/images/favicon-abc.png',
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().favicon_path).toBe('/images/favicon-abc.png')
    })

    it('rejects a javascript: URI as favicon_path', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Bad Favicon',
          tagline: '',
          description: '',
          cover_art_path: null,
          favicon_path: 'javascript:alert(1)',
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(400)
    })

    it('persists browser_tab_title independently of podcast_name', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'My Podcast',
          browser_tab_title: 'My Business Name',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.podcast_name).toBe('My Podcast')
      expect(body.browser_tab_title).toBe('My Business Name')
    })

    it('sets browser_tab_title to null when not provided', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'No Tab Title',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().browser_tab_title).toBeNull()
    })
  })

  describe('PATCH /api/admin/settings', () => {
    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        payload: { podcast_name: 'New Name' }
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 400 when no fields are provided', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {}
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'No fields to update' })
    })

    it('updates only provided fields and returns full settings object', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      // First set some values via PUT
      await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Initial Name',
          tagline: 'Initial Tagline',
          description: 'Initial Desc',
          cover_art_path: null,
          accent_color: '#aabbcc'
        }
      })

      // Now patch only podcast_name
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { podcast_name: 'Patched Name' }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.podcast_name).toBe('Patched Name')
      // Other fields unchanged
      expect(body.tagline).toBe('Initial Tagline')
      expect(body.description).toBe('Initial Desc')
      expect(body.accent_color).toBe('#aabbcc')
    })

    it('can patch cover_art_path to null', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      // Set cover_art_path first
      await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Test',
          tagline: '',
          description: '',
          cover_art_path: '/audio/art.jpg',
          accent_color: '#000000'
        }
      })

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { cover_art_path: null }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().cover_art_path).toBeNull()
    })

    it('patches favicon_path and rejects an invalid one', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const okRes = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { favicon_path: '/images/favicon-xyz.ico' }
      })
      expect(okRes.statusCode).toBe(200)
      expect(okRes.json().favicon_path).toBe('/images/favicon-xyz.ico')

      const badRes = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { favicon_path: 'javascript:alert(1)' }
      })
      expect(badRes.statusCode).toBe(400)
    })

    it('patches browser_tab_title independently of podcast_name', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { browser_tab_title: 'Positive Sex Ed' }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.browser_tab_title).toBe('Positive Sex Ed')
      expect(body.podcast_name).not.toBe('Positive Sex Ed')
    })

    it('rejects a PATCH body containing a field not in the allowlist (SQL injection guard)', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { 'podcast_name; DROP TABLE settings; --': 'pwned' }
      })

      expect(res.statusCode).toBe(400)
    })

    it('rejects a javascript: URI as cover_art_path', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { cover_art_path: 'javascript:alert(1)' }
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
