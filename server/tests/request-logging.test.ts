import { describe, it, expect, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { buildTestAppWithLogCapture } from './helpers.js'

const VALID_PASSWORD = 'supersecret'

async function makeApp() {
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(VALID_PASSWORD, 10)
  return buildTestAppWithLogCapture()
}

function firstCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string | string[]
  return (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]
}

describe('PRIV-1: automatic request logging is disabled, deliberate logging is not', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  it('produces no automatic request-log line for a plain request', async () => {
    const { app, logs } = await makeApp()

    await app.inject({ method: 'GET', url: '/api/health' })

    // Fastify's automatic onRequest/onResponse lines carry req.remoteAddress
    // or one of these default messages — disableRequestLogging (app.ts)
    // should mean neither ever appears, for any request, regardless of
    // whether that request also triggers deliberate logging elsewhere.
    for (const line of logs) {
      const req = line.req as { remoteAddress?: unknown } | undefined
      expect(req?.remoteAddress).toBeUndefined()
      expect(line.msg).not.toBe('incoming request')
      expect(line.msg).not.toBe('request completed')
    }
  })

  it('still logs a deliberate admin_login event (failure) with ip', async () => {
    const { app, logs } = await makeApp()

    await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'wrongpassword' } })

    const loginLog = logs.find(l => l.event === 'admin_login')
    expect(loginLog).toMatchObject({ event: 'admin_login', outcome: 'failure' })
    expect(loginLog?.ip).toBeDefined()
  })

  it('still logs deliberate admin_login (success) and admin_logout events with ip', async () => {
    const { app, logs } = await makeApp()

    const loginRes = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: VALID_PASSWORD } })
    const cookie = firstCookieFrom(loginRes)
    await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } })

    const loginLog = logs.find(l => l.event === 'admin_login')
    expect(loginLog).toMatchObject({ event: 'admin_login', outcome: 'success' })
    expect(loginLog?.ip).toBeDefined()

    const logoutLog = logs.find(l => l.event === 'admin_logout')
    expect(logoutLog).toMatchObject({ event: 'admin_logout' })
    expect(logoutLog?.ip).toBeDefined()
  })
})
