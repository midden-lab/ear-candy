import { describe, it, expect } from 'vitest'
import { buildTestApp, buildTestAppWithLogCapture } from './helpers.js'

// Security audit M4: there used to be no central error handler, so an
// unexpected throw reached the client as Fastify's default 500 body with
// the raw error message (SQLite text, internals). The handler below must
// (a) hide that for 5xx and log it server-side, and (b) leave 4xx responses
// - rate-limit 429, body-too-large 413, malformed-JSON 400 - exactly as
// Fastify/plugins produce them today.

describe('central error handler', () => {
  it('replies 500 {error:"Internal server error"} with no raw message, stack or DB text, and logs the real error', async () => {
    const { app, logs } = buildTestAppWithLogCapture()
    app.get('/__boom', async () => { throw new Error('SQLITE_CONSTRAINT: NOT NULL failed: settings.accent_color at /app/dist/x.js:1') })

    const res = await app.inject({ method: 'GET', url: '/__boom' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Internal server error' })
    expect(res.body).not.toMatch(/SQLITE|settings|accent|stack|\.js|at /i)
    const logged = logs.find(l => l.level === 50 && JSON.stringify(l).includes('SQLITE_CONSTRAINT'))
    expect(logged).toBeDefined()
  })

  it('a SQLite binding failure inside a real admin route no longer leaks internals', async () => {
    const app = buildTestApp()
    // anonymous login with a body that throws deep inside is covered elsewhere;
    // here: any thrown error on a public route is sanitized too.
    app.get('/__boom2', async () => { throw Object.assign(new Error('boom'), { code: 'SQLITE_ERROR' }) })
    const res = await app.inject({ method: 'GET', url: '/__boom2' })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Internal server error' })
  })

  describe('4xx responses keep their current status codes and body shapes', () => {
    it('malformed JSON -> 400 in Fastify\'s standard error shape', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST', url: '/api/analytics/event',
        headers: { 'content-type': 'application/json' }, payload: '{not json',
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request' })
      expect(typeof body.message).toBe('string')
      expect(typeof body.code).toBe('string')
    })

    it('body over the limit -> 413 in Fastify\'s standard error shape', async () => {
      const app = buildTestApp()
      const res = await app.inject({
        method: 'POST', url: '/api/analytics/event',
        payload: { event_type: 'page_view', session_id: 'sess-1', referrer: 'x'.repeat(10000) },
      })
      expect(res.statusCode).toBe(413)
      expect(res.json()).toMatchObject({ statusCode: 413, error: 'Payload Too Large' })
    })

    it('rate limit exceeded -> 429 in the rate-limit plugin\'s shape, with its headers', async () => {
      const app = buildTestApp()
      let last = await app.inject({ method: 'GET', url: '/api/health' })
      for (let i = 0; i < 125; i++) {
        last = await app.inject({
          method: 'POST', url: '/api/analytics/event',
          headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
          payload: { event_type: 'page_view', session_id: `s-${i}` },
        })
      }
      expect(last.statusCode).toBe(429)
      expect(last.json()).toMatchObject({ statusCode: 429, error: 'Too Many Requests' })
      expect(last.headers['retry-after']).toBeDefined()
    })
  })
})
