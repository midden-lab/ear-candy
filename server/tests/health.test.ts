import { describe, it, expect } from 'vitest'
import { buildTestApp } from './helpers.js'

describe('GET /api/health', () => {
  it('returns 200 with db and uploads checks passing', async () => {
    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, checks: { db: true, uploads: true } })
  })
})
