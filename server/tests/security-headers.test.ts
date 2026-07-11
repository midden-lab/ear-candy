import { describe, it, expect } from 'vitest'
import { buildTestApp } from './helpers.js'

describe('security headers (helmet)', () => {
  it('sets standard security headers on API responses', async () => {
    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/settings' })

    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    // Deliberately not set — see the comment in app.ts on why HSTS is off
    // for this self-hosted app.
    expect(res.headers['strict-transport-security']).toBeUndefined()
  })
})
