import { describe, it, expect, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'

describe('COOKIE_SECRET requirement', () => {
  const original = process.env.COOKIE_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.COOKIE_SECRET
    else process.env.COOKIE_SECRET = original
  })

  it('throws instead of silently falling back to a hardcoded secret when COOKIE_SECRET is unset', () => {
    delete process.env.COOKIE_SECRET
    expect(() => buildApp({ dbPath: ':memory:', logger: false })).toThrow('COOKIE_SECRET env var is required')
  })

  it('builds successfully when COOKIE_SECRET is set', () => {
    process.env.COOKIE_SECRET = 'a-real-secret'
    expect(() => buildApp({ dbPath: ':memory:', logger: false })).not.toThrow()
  })
})
