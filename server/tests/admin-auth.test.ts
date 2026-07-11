import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'
import { requireAdmin } from '../src/auth.js'

const VALID_PASSWORD = 'supersecret'

async function makeApp(withHash = true) {
  if (withHash) {
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(VALID_PASSWORD, 10)
  } else {
    delete process.env.ADMIN_PASSWORD_HASH
  }
  return buildTestApp()
}

describe('POST /api/admin/login', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  it('returns 200 and sets a signed cookie on correct password', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const setCookie = res.headers['set-cookie'] as string | string[]
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
    expect(cookieHeader).toContain('admin_session=')
    expect(cookieHeader).toContain('HttpOnly')
    expect(cookieHeader).toContain('SameSite=Strict')
  })

  it('locks out after repeated FAILED login attempts', async () => {
    const app = await makeApp()

    // Limit is 10 failed attempts per 15 minutes.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrongpassword' }
      })
      expect(res.statusCode).toBe(401)
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrongpassword' }
    })
    expect(limited.statusCode).toBe(429)
  })

  it('does not count successful logins against the failed-attempt limit', async () => {
    const app = await makeApp()

    // Repeatedly logging in with the CORRECT password (e.g. a test suite
    // authenticating once per test) must never trip the brute-force guard.
    for (let i = 0; i < 15; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: VALID_PASSWORD }
      })
      expect(res.statusCode).toBe(200)
    }
  })

  it('a successful login resets the failed-attempt counter', async () => {
    const app = await makeApp()

    for (let i = 0; i < 9; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrongpassword' }
      })
    }

    const success = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    expect(success.statusCode).toBe(200)

    // Counter should be cleared — another 9 failures shouldn't lock out yet.
    for (let i = 0; i < 9; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrongpassword' }
      })
      expect(res.statusCode).toBe(401)
    }
  })

  it('returns 401 on wrong password', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrongpassword' }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'Invalid password' })
  })

  it('returns 500 when ADMIN_PASSWORD_HASH is not set', async () => {
    const app = await makeApp(false)
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    expect(res.statusCode).toBe(500)
    // Generic message on the wire (EC-010) — the real reason is logged server-side.
    expect(res.json()).toEqual({ error: 'Internal server error' })
  })
})

describe('POST /api/admin/logout', () => {
  it('returns 200 and clears the cookie', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/logout'
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const setCookie = res.headers['set-cookie'] as string | string[]
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie ?? ''
    // Cookie should be cleared (expires in the past or max-age=0 or empty value)
    expect(cookieHeader).toContain('admin_session=')
  })
})

describe('requireAdmin preHandler', () => {
  beforeEach(async () => {
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(VALID_PASSWORD, 10)
  })

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  it('returns 401 when no cookie is present', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test-protected' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 200 when valid signed cookie is present', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    // First login to get a valid signed cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    expect(loginRes.statusCode).toBe(200)

    // Extract the cookie value from Set-Cookie header
    const setCookie = loginRes.headers['set-cookie'] as string | string[]
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    const cookieValue = cookieStr.split(';')[0] // e.g. "admin_session=s%3A..."

    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { cookie: cookieValue }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('returns 401 when cookie has invalid signature', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { cookie: 'admin_session=authenticated' } // unsigned / tampered
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'Unauthorized' })
  })
})
