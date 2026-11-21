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

  describe('GET /api/admin/settings', () => {
    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()
      const res = await app.inject({ method: 'GET', url: '/api/admin/settings' })
      expect(res.statusCode).toBe(401)
    })

    it('returns the full settings row, including excluded_analytics_ips, for an authenticated admin', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      app.db.prepare('UPDATE settings SET excluded_analytics_ips = ?').run('203.0.113.5')

      const res = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie } })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.excluded_analytics_ips).toBe('203.0.113.5')
      expect(body.podcast_name).toBe('Ear Candy')
    })
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

    it('defaults analytics_enabled and track_returning_listeners to true when omitted', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'No Analytics Fields Given',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.analytics_enabled).toBeTruthy()
      expect(body.track_returning_listeners).toBeTruthy()
    })

    it('persists explicit false values for analytics_enabled and track_returning_listeners', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Analytics Off',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456',
          analytics_enabled: false,
          track_returning_listeners: false,
        }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.analytics_enabled).toBeFalsy()
      expect(body.track_returning_listeners).toBeFalsy()
    })

    it('defaults excluded_analytics_ips to null when omitted', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'No Excluded IPs Given',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456'
        }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().excluded_analytics_ips).toBeNull()
    })

    it('persists excluded_analytics_ips and rejects one over the length cap', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const ok = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Excluded IPs Set',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456',
          excluded_analytics_ips: '203.0.113.5, 198.51.100.9',
        }
      })
      expect(ok.statusCode).toBe(200)
      expect(ok.json().excluded_analytics_ips).toBe('203.0.113.5, 198.51.100.9')

      const tooLong = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: {
          podcast_name: 'Excluded IPs Too Long',
          tagline: '',
          description: '',
          cover_art_path: null,
          accent_color: '#123456',
          excluded_analytics_ips: '1'.repeat(501),
        }
      })
      expect(tooLong.statusCode).toBe(400)
    })
  })

  // M1 (plan 020 / security audit 2026-11): PUT used to DELETE the settings
  // row and INSERT a new one without session_epoch, so the epoch reset to 0
  // (reviving cookies already revoked by earlier logouts and killing the
  // admin's own), and a failure between the two statements left zero rows
  // (public /api/settings then 500s — site down).
  describe('PUT /api/admin/settings preserves the row and session_epoch', () => {
    const BASE = { podcast_name: 'Replaced', tagline: 't', description: 'd', accent_color: '#112233' }

    const epochOf = (app: Awaited<ReturnType<typeof makeApp>>) =>
      (app.db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number }).session_epoch
    const rowCount = (app: Awaited<ReturnType<typeof makeApp>>) =>
      (app.db.prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number }).c

    it('leaves session_epoch alone: revoked cookies stay revoked and the admin\'s own cookie stays valid', async () => {
      const app = await makeApp()
      const revoked = await getAuthCookie(app) // issued at epoch 0

      // Two real logouts -> epoch 2.
      for (let i = 0; i < 2; i++) {
        const c = await getAuthCookie(app)
        const out = await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie: c } })
        expect(out.statusCode).toBe(200)
      }
      expect(epochOf(app)).toBe(2)

      const current = await getAuthCookie(app)
      const put = await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { cookie: current }, payload: BASE })
      expect(put.statusCode).toBe(200)

      expect(epochOf(app)).toBe(2)
      const stillRevoked = await app.inject({ method: 'GET', url: '/api/admin/session', headers: { cookie: revoked } })
      expect(stillRevoked.statusCode).toBe(401)
      const stillValid = await app.inject({ method: 'GET', url: '/api/admin/session', headers: { cookie: current } })
      expect(stillValid.statusCode).toBe(200)
    })

    it('keeps exactly one settings row after a PUT, including a rejected one', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { cookie }, payload: BASE })
      expect(rowCount(app)).toBe(1)

      const rejected = await app.inject({
        method: 'PUT', url: '/api/admin/settings', headers: { cookie },
        payload: { ...BASE, cover_art_path: 'javascript:alert(1)' }
      })
      expect(rejected.statusCode).toBe(400)
      expect(rowCount(app)).toBe(1)
    })

    it('replaces every PUT-able field, setting nullable ones back to null/default when omitted', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      await app.inject({
        method: 'PUT', url: '/api/admin/settings', headers: { cookie },
        payload: {
          podcast_name: 'First', tagline: 'a', description: 'b', accent_color: '#abcdef',
          cover_art_path: '/images/c.png', favicon_path: '/images/f.png', browser_tab_title: 'Tab',
          analytics_enabled: false, track_returning_listeners: false, excluded_analytics_ips: '203.0.113.5',
        }
      })

      const res = await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { cookie }, payload: BASE })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        podcast_name: 'Replaced', tagline: 't', description: 'd', accent_color: '#112233',
        cover_art_path: null, favicon_path: null, browser_tab_title: null,
        analytics_enabled: 1, track_returning_listeners: 1, excluded_analytics_ips: null,
      })
      expect(rowCount(app)).toBe(1)
    })

    it('leaves the original row intact when the write itself fails mid-PUT', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)
      await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { cookie }, payload: { ...BASE, podcast_name: 'Original' } })

      // An object where a string is expected passes the route's own checks
      // but makes SQLite throw while binding — i.e. a failure in the middle
      // of the write. The old DELETE-then-INSERT left zero rows here.
      const res = await app.inject({
        method: 'PUT', url: '/api/admin/settings', headers: { cookie },
        payload: { ...BASE, podcast_name: 'Should not persist', tagline: { not: 'a string' } }
      })
      expect(res.statusCode).toBeGreaterThanOrEqual(400)

      expect(rowCount(app)).toBe(1)
      const row = app.db.prepare('SELECT podcast_name FROM settings').get() as { podcast_name: string }
      expect(row.podcast_name).toBe('Original')
      const pub = await app.inject({ method: 'GET', url: '/api/settings' })
      expect(pub.statusCode).toBe(200)
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
        payload: { browser_tab_title: 'Acme Media Co' }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.browser_tab_title).toBe('Acme Media Co')
      expect(body.podcast_name).not.toBe('Acme Media Co')
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

    it('patches analytics_enabled and track_returning_listeners independently', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { analytics_enabled: false }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.analytics_enabled).toBeFalsy()
      // Untouched field keeps its default.
      expect(body.track_returning_listeners).toBeTruthy()
    })

    it('patches excluded_analytics_ips and rejects one over the length cap', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const ok = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { excluded_analytics_ips: '203.0.113.5, 198.51.100.9' }
      })
      expect(ok.statusCode).toBe(200)
      expect(ok.json().excluded_analytics_ips).toBe('203.0.113.5, 198.51.100.9')

      const tooLong = await app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie },
        payload: { excluded_analytics_ips: '1'.repeat(501) }
      })
      expect(tooLong.statusCode).toBe(400)
    })
  })

  describe('GET /api/admin/my-ip', () => {
    it('returns 401 without auth cookie', async () => {
      const app = await makeApp()
      const res = await app.inject({ method: 'GET', url: '/api/admin/my-ip' })
      expect(res.statusCode).toBe(401)
    })

    it('returns the normalized request IP for an authenticated admin', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/my-ip',
        headers: { cookie },
        remoteAddress: '203.0.113.5',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ip: '203.0.113.5' })
    })

    it('normalizes an IPv4-mapped-IPv6 request address before returning it', async () => {
      const app = await makeApp()
      const cookie = await getAuthCookie(app)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/my-ip',
        headers: { cookie },
        remoteAddress: '::ffff:203.0.113.5',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ip: '203.0.113.5' })
    })
  })
})
