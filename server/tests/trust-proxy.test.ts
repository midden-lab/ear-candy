import { describe, it, expect, afterEach } from 'vitest'
import { buildTestApp } from './helpers.js'
import { resolveTrustedProxies } from '../src/app.js'

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

describe('resolveTrustedProxies (TRUSTED_PROXY_IPS env var, issue #33)', () => {
  it('defaults to loopback-only when unset', () => {
    expect(resolveTrustedProxies(undefined)).toEqual(['127.0.0.1', '::1'])
    expect(resolveTrustedProxies('')).toEqual(['127.0.0.1', '::1'])
  })

  it('parses a comma-separated list, e.g. loopback plus a Docker bridge gateway', () => {
    expect(resolveTrustedProxies('127.0.0.1,::1,172.17.0.1')).toEqual(['127.0.0.1', '::1', '172.17.0.1'])
  })

  it('trims whitespace around entries', () => {
    expect(resolveTrustedProxies(' 127.0.0.1 , ::1 , 172.17.0.1 ')).toEqual(['127.0.0.1', '::1', '172.17.0.1'])
  })

  it('falls back to defaults if the value is only whitespace/commas', () => {
    expect(resolveTrustedProxies(' , , ')).toEqual(['127.0.0.1', '::1'])
  })
})

describe('buildApp honors TRUSTED_PROXY_IPS end to end (issue #33)', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_IPS
  })

  it('trusts X-Forwarded-For from a configured non-loopback proxy address (e.g. a Docker bridge gateway)', async () => {
    process.env.TRUSTED_PROXY_IPS = '172.17.0.1'
    const app = buildTestApp()
    app.get('/whoami', async (req) => ({ ip: req.ip }))

    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      remoteAddress: '172.17.0.1',
      headers: { 'x-forwarded-for': '203.0.113.5' }
    })
    expect(res.json()).toEqual({ ip: '203.0.113.5' })
  })

  it('still ignores X-Forwarded-For from an address not in the configured list', async () => {
    process.env.TRUSTED_PROXY_IPS = '172.17.0.1'
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
})
