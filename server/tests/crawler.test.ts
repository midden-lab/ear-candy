import { describe, it, expect } from 'vitest'
import { isKnownCrawler, resolveConfiguredOrigin } from '../src/utils/crawler.js'

describe('isKnownCrawler', () => {
  it('recognizes known crawler user agents', () => {
    expect(isKnownCrawler('Twitterbot/1.0')).toBe(true)
    expect(isKnownCrawler('facebookexternalhit/1.1')).toBe(true)
    expect(isKnownCrawler('Slackbot-LinkExpanding 1.0')).toBe(true)
    expect(isKnownCrawler('Discordbot/2.0')).toBe(true)
  })

  it('does not recognize a real browser', () => {
    expect(isKnownCrawler('Mozilla/5.0 (real browser)')).toBe(false)
  })

  it('handles a missing user agent', () => {
    expect(isKnownCrawler(undefined)).toBe(false)
  })
})

describe('resolveConfiguredOrigin', () => {
  it('returns null when unset', () => {
    expect(resolveConfiguredOrigin(undefined)).toBeNull()
    expect(resolveConfiguredOrigin('')).toBeNull()
  })

  it('accepts a well-formed http(s) origin', () => {
    expect(resolveConfiguredOrigin('https://podcast.example.com')).toBe('https://podcast.example.com')
    expect(resolveConfiguredOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('trims a trailing slash', () => {
    expect(resolveConfiguredOrigin('https://podcast.example.com/')).toBe('https://podcast.example.com')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveConfiguredOrigin('  https://podcast.example.com  ')).toBe('https://podcast.example.com')
  })

  it('rejects a value with a path component', () => {
    expect(resolveConfiguredOrigin('https://podcast.example.com/some/path')).toBeNull()
  })

  it('rejects a non-http(s) scheme', () => {
    expect(resolveConfiguredOrigin('ftp://podcast.example.com')).toBeNull()
  })

  it('rejects a bare hostname with no scheme', () => {
    expect(resolveConfiguredOrigin('podcast.example.com')).toBeNull()
  })
})
