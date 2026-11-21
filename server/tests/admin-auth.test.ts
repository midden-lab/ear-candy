import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import bcrypt from 'bcrypt'
import { sign as signCookie } from '@fastify/cookie'
import { buildTestApp, buildTestAppWithLogCapture } from './helpers.js'
import { requireAdmin, SESSION_MAX_AGE_MS } from '../src/auth.js'

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
    expect(cookieHeader).toMatch(/Max-Age=86400\b/)
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

  // H2 (plan 020 / security audit 2026-11): the old global hard lockout
  // (30 failures from ANY IPs in 30 min -> 429 for everyone) also blocked
  // the real admin's CORRECT password, so an attacker with a few IPs could
  // lock the only admin out indefinitely. The global counter is now
  // observability-only; see the spike-log test below.
  it('does not block a correct-password login after many failures spread across distinct IPs', async () => {
    const app = await makeApp()

    for (let i = 0; i < 31; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrongpassword' },
        remoteAddress: `10.0.0.${i}`
      })
      expect(res.statusCode).toBe(401)
    }

    const ok = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD },
      remoteAddress: '10.0.0.99' // a brand-new IP, never used above
    })
    expect(ok.statusCode).toBe(200)
  })

  it('a single IP\'s own per-IP lockout still trips independently of the global counter', async () => {
    const app = await makeApp()

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrongpassword' },
        remoteAddress: '10.0.0.1'
      })
      expect(res.statusCode).toBe(401)
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrongpassword' },
      remoteAddress: '10.0.0.1'
    })
    expect(limited.statusCode).toBe(429)

    // A different IP, having contributed only 10 of the 30 needed for the
    // global lockout, is unaffected.
    const otherIp = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD },
      remoteAddress: '10.0.0.2'
    })
    expect(otherIp.statusCode).toBe(200)
  })

  it('rejects malformed login bodies with 400, not 500, and counts them against the per-IP counter only', async () => {
    const app = await makeApp()
    const bodies: Array<[string, unknown]> = [
      ['no body', undefined],
      ['empty object', {}],
      ['numeric password', { password: 123 }],
      ['array password', { password: ['a'] }],
      ['empty string', { password: '' }],
    ]
    for (const [label, payload] of bodies) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        ...(payload === undefined ? {} : { payload: payload as object }),
        remoteAddress: '10.9.0.1'
      })
      expect(res.statusCode, label).toBe(400)
      expect(res.json(), label).toEqual({ error: 'password is required' })
    }

    // Counted against that IP: 5 above + 5 more = 10 -> now locked out,
    // even for the correct password.
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/api/admin/login', payload: {}, remoteAddress: '10.9.0.1' })
    }
    const locked = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD },
      remoteAddress: '10.9.0.1'
    })
    expect(locked.statusCode).toBe(429)

    // ...but a different IP is unaffected.
    const other = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD },
      remoteAddress: '10.9.0.2'
    })
    expect(other.statusCode).toBe(200)
  })

  describe('global failure spike logging (observability only)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    async function failFrom(app: ReturnType<typeof buildTestAppWithLogCapture>['app'], count: number, prefix: string, payload: object = { password: 'wrongpassword' }) {
      for (let i = 0; i < count; i++) {
        await app.inject({ method: 'POST', url: '/api/admin/login', payload, remoteAddress: `${prefix}.${i}` })
      }
    }

    it('logs one warn per window when the global count reaches the old threshold, never with the password, and never blocks', async () => {
      process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(VALID_PASSWORD, 10)
      const { app, logs } = buildTestAppWithLogCapture()
      const spikes = () => logs.filter(l => l.event === 'admin_login_global_failure_spike')

      await failFrom(app, 29, '10.1.0')
      expect(spikes()).toHaveLength(0)

      await failFrom(app, 6, '10.1.1') // crosses 30, keeps going to 35
      expect(spikes()).toHaveLength(1)
      expect(spikes()[0]).toMatchObject({ level: 40, count: 30 })

      // No log line may contain the submitted password.
      expect(JSON.stringify(logs)).not.toContain('wrongpassword')

      // Still not blocked.
      const ok = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: VALID_PASSWORD },
        remoteAddress: '10.1.9.9'
      })
      expect(ok.statusCode).toBe(200)
    })

    it('logs again in the next window', async () => {
      process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(VALID_PASSWORD, 10)
      vi.useFakeTimers({ toFake: ['Date'] })
      const { app, logs } = buildTestAppWithLogCapture()
      const spikes = () => logs.filter(l => l.event === 'admin_login_global_failure_spike')

      await failFrom(app, 30, '10.2.0')
      expect(spikes()).toHaveLength(1)

      vi.setSystemTime(Date.now() + 31 * 60 * 1000) // past the 30-minute window
      await failFrom(app, 30, '10.2.1')
      expect(spikes()).toHaveLength(2)
    })

    it('does not count malformed bodies toward the global spike counter', async () => {
      process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(VALID_PASSWORD, 10)
      const { app, logs } = buildTestAppWithLogCapture()

      await failFrom(app, 40, '10.3.0', {})
      expect(logs.filter(l => l.event === 'admin_login_global_failure_spike')).toHaveLength(0)
    })
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
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  function epochOf(app: Awaited<ReturnType<typeof makeApp>>): number {
    return (app.db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number }).session_epoch
  }

  async function loginCookie(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    const setCookie = res.headers['set-cookie'] as string | string[]
    return (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]
  }

  // H1 (plan 020 / security audit 2026-11): logout used to have no auth
  // check, so any anonymous caller could bump session_epoch and revoke the
  // admin's session on demand, repeatedly.
  it('rejects an anonymous logout with 401 and does not touch session_epoch', async () => {
    const app = await makeApp()
    const before = epochOf(app)

    const res = await app.inject({ method: 'POST', url: '/api/admin/logout' })

    expect(res.statusCode).toBe(401)
    expect(epochOf(app)).toBe(before)
  })

  it('rejects a logout carrying a forged/invalid-signature cookie with 401 and does not touch session_epoch', async () => {
    const app = await makeApp()
    const before = epochOf(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { cookie: `admin_session=authenticated:${Date.now()}:${before}.not-a-real-signature` }
    })

    expect(res.statusCode).toBe(401)
    expect(epochOf(app)).toBe(before)
  })

  it('an authenticated logout returns 200, clears the cookie, bumps session_epoch by 1, and revokes that same cookie', async () => {
    const app = await makeApp()
    const cookie = await loginCookie(app)
    const before = epochOf(app)

    const sessionBefore = await app.inject({ method: 'GET', url: '/api/admin/session', headers: { cookie } })
    expect(sessionBefore.statusCode).toBe(200)

    const res = await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const setCookie = res.headers['set-cookie'] as string | string[]
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie ?? ''
    expect(cookieHeader).toContain('admin_session=')
    expect(epochOf(app)).toBe(before + 1)

    const sessionAfter = await app.inject({ method: 'GET', url: '/api/admin/session', headers: { cookie } })
    expect(sessionAfter.statusCode).toBe(401)
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

  it('returns 401 once the session is older than SESSION_MAX_AGE_MS (issue #30)', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    const setCookie = loginRes.headers['set-cookie'] as string | string[]
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    const cookieValue = cookieStr.split(';')[0]

    const realDateNow = Date.now
    try {
      Date.now = () => realDateNow() + SESSION_MAX_AGE_MS + 1000
      const res = await app.inject({
        method: 'GET',
        url: '/test-protected',
        headers: { cookie: cookieValue }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ error: 'Unauthorized' })
    } finally {
      Date.now = realDateNow
    }
  })

  it('rejects a session cookie replayed after logout (issue #34 — server-side revocation)', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    const setCookie = loginRes.headers['set-cookie'] as string | string[]
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    const cookieValue = cookieStr.split(';')[0]

    // Confirm the cookie is valid before logout.
    const beforeLogout = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { cookie: cookieValue }
    })
    expect(beforeLogout.statusCode).toBe(200)

    await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie: cookieValue } })

    // The original (now-stale) cookie must no longer authenticate, even
    // though it's still signature-valid and well within its 24h age limit.
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { cookie: cookieValue }
    })
    expect(afterLogout.statusCode).toBe(401)
  })

  it('a fresh login after logout issues a new, valid cookie', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    const firstLogin = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: VALID_PASSWORD } })
    const firstCookie = (Array.isArray(firstLogin.headers['set-cookie']) ? firstLogin.headers['set-cookie'][0] : firstLogin.headers['set-cookie'] as string).split(';')[0]
    await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie: firstCookie } })

    const secondLogin = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: VALID_PASSWORD } })
    const secondCookie = (Array.isArray(secondLogin.headers['set-cookie']) ? secondLogin.headers['set-cookie'][0] : secondLogin.headers['set-cookie'] as string).split(';')[0]

    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { cookie: secondCookie }
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a validly-signed pre-revocation-era cookie with no epoch segment (authenticated:<ts>, no crash)', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    // Simulate a cookie issued by the pre-#34 version of buildSessionCookieValue
    // (two-part: "authenticated:<ts>", no epoch) — validly signed, so this
    // exercises the epoch-parsing fallback specifically, not signature
    // rejection (already covered by the "invalid signature" test above).
    const oldFormatValue = `authenticated:${Date.now()}`
    const signed = signCookie(oldFormatValue, process.env.COOKIE_SECRET as string)

    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { cookie: `admin_session=${signed}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('still accepts a session well within SESSION_MAX_AGE_MS', async () => {
    const app = buildTestApp()
    app.get('/test-protected', { preHandler: requireAdmin }, async () => ({ ok: true }))

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: VALID_PASSWORD }
    })
    const setCookie = loginRes.headers['set-cookie'] as string | string[]
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    const cookieValue = cookieStr.split(';')[0]

    const realDateNow = Date.now
    try {
      Date.now = () => realDateNow() + SESSION_MAX_AGE_MS / 2
      const res = await app.inject({
        method: 'GET',
        url: '/test-protected',
        headers: { cookie: cookieValue }
      })
      expect(res.statusCode).toBe(200)
    } finally {
      Date.now = realDateNow
    }
  })
})
