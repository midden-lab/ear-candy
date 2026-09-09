import { describe, it, expect } from 'vitest'
import { normalizeIp, parseExcludedIps, isExcludedIp } from '../src/utils/ipMatch.js'

describe('normalizeIp', () => {
  it('strips the IPv4-mapped-IPv6 prefix', () => {
    expect(normalizeIp('::ffff:203.0.113.5')).toBe('203.0.113.5')
  })

  it('is case-insensitive on the ::ffff: prefix', () => {
    expect(normalizeIp('::FFFF:203.0.113.5')).toBe('203.0.113.5')
  })

  it('leaves a plain IPv4 address unchanged', () => {
    expect(normalizeIp('203.0.113.5')).toBe('203.0.113.5')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeIp('  203.0.113.5  ')).toBe('203.0.113.5')
  })

  it('leaves a real IPv6 address unchanged, not mistaking it for the mapped-v4 shape', () => {
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
  })
})

describe('parseExcludedIps', () => {
  it('returns an empty array for null or empty input', () => {
    expect(parseExcludedIps(null)).toEqual([])
    expect(parseExcludedIps(undefined)).toEqual([])
    expect(parseExcludedIps('')).toEqual([])
  })

  it('splits, trims, normalizes, and drops blank segments from stray commas', () => {
    expect(parseExcludedIps('203.0.113.5, 198.51.100.9,,  ')).toEqual(['203.0.113.5', '198.51.100.9'])
  })

  it('normalizes each entry', () => {
    expect(parseExcludedIps('::ffff:203.0.113.5, 198.51.100.9')).toEqual(['203.0.113.5', '198.51.100.9'])
  })
})

describe('isExcludedIp', () => {
  it('matches an exact IP present in the list', () => {
    expect(isExcludedIp('203.0.113.5', '203.0.113.5, 198.51.100.9')).toBe(true)
  })

  it('does not match an IP absent from the list', () => {
    expect(isExcludedIp('198.51.100.1', '203.0.113.5, 198.51.100.9')).toBe(false)
  })

  it('does not match on a partial/prefix basis', () => {
    expect(isExcludedIp('203.0.113.50', '203.0.113.5')).toBe(false)
  })

  it('matches across the ::ffff: normalization on either side', () => {
    expect(isExcludedIp('::ffff:203.0.113.5', '203.0.113.5')).toBe(true)
    expect(isExcludedIp('203.0.113.5', '::ffff:203.0.113.5')).toBe(true)
  })

  it('returns false for an empty or null excluded list', () => {
    expect(isExcludedIp('203.0.113.5', null)).toBe(false)
    expect(isExcludedIp('203.0.113.5', '')).toBe(false)
  })
})
