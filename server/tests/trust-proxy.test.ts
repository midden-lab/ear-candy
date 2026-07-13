import { describe, it, expect } from 'vitest'
import { buildTestApp } from './helpers.js'

// Production sits behind Caddy on the same host, reverse-proxying over
// loopback. Without trustProxy, req.ip is always the direct TCP peer —
// in production, that's Caddy's loopback address for every request,
// collapsing every real visitor into one shared IP for anything keyed on
// req.ip (e.g. the login lockout counter — issue #33). These tests assert
// the fix: X-Forwarded-For is honored only when the connection itself
// comes from loopback, and ignored/untrusted otherwise.
describe('trustProxy (issue #33)', () => {
  it('resolves req.ip from X-Forwarded-For when the connection is from loopback', async () => {
    const app = buildTestApp()
    app.get('/whoami', async (req) => ({ ip: req.ip }))

    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.5' }
    })
    expect(res.json()).toEqual({ ip: '203.0.113.5' })
  })

  it('ignores a forwarded-for header from a non-loopback connection (no spoofing)', async () => {
    const app = buildTestApp()
    app.get('/whoami', async (req) => ({ ip: req.ip }))

    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      remoteAddress: '203.0.113.9',
      headers: { 'x-forwarded-for': '9.9.9.9' }
    })
    expect(res.json()).toEqual({ ip: '203.0.113.9' })
  })

  it('falls back to the loopback address itself when no forwarded-for header is present', async () => {
    const app = buildTestApp()
    app.get('/whoami', async (req) => ({ ip: req.ip }))

    const res = await app.inject({ method: 'GET', url: '/whoami', remoteAddress: '127.0.0.1' })
    expect(res.json()).toEqual({ ip: '127.0.0.1' })
  })
})
