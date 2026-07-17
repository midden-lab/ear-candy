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

  it('builds successfully when COOKIE_SECRET is set and long enough', () => {
    process.env.COOKIE_SECRET = 'a'.repeat(32)
    expect(() => buildApp({ dbPath: ':memory:', logger: false })).not.toThrow()
  })

  it('throws when COOKIE_SECRET is set but below the minimum length (issue #40)', () => {
    process.env.COOKIE_SECRET = 'too-short'
    expect(() => buildApp({ dbPath: ':memory:', logger: false })).toThrow('COOKIE_SECRET must be at least 32 characters (got 9)')
  })

  it('accepts a secret exactly at the minimum length', () => {
    process.env.COOKIE_SECRET = 'a'.repeat(32)
    expect(() => buildApp({ dbPath: ':memory:', logger: false })).not.toThrow()
  })

  it('rejects a secret one character below the minimum length', () => {
    process.env.COOKIE_SECRET = 'a'.repeat(31)
    expect(() => buildApp({ dbPath: ':memory:', logger: false })).toThrow('COOKIE_SECRET must be at least 32 characters (got 31)')
  })
})
