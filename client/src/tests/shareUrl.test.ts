import { describe, it, expect } from 'vitest'
import { buildShareUrl, buildTweetIntentUrl, buildFacebookIntentUrl } from '../utils/shareUrl'

describe('buildShareUrl', () => {
  it('builds a URL with just the episode id when no timestamp is given', () => {
    const url = buildShareUrl(123)
    expect(url).toBe(`${window.location.origin}/?episode=123`)
  })

  it('includes a t param when a positive timestamp is given', () => {
    const url = buildShareUrl(123, 754)
    expect(url).toBe(`${window.location.origin}/?episode=123&t=754`)
  })

  it('floors a fractional timestamp', () => {
    const url = buildShareUrl(123, 754.9)
    expect(url).toContain('t=754')
  })

  it('omits t entirely for a zero or undefined timestamp', () => {
    expect(buildShareUrl(123, 0)).toBe(`${window.location.origin}/?episode=123`)
    expect(buildShareUrl(123, undefined)).toBe(`${window.location.origin}/?episode=123`)
  })
})

describe('buildTweetIntentUrl', () => {
  it('encodes the share URL and episode title into a tweet intent URL', () => {
    const intent = buildTweetIntentUrl('https://example.com/?episode=1', 'My Episode')
    expect(intent).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.com%2F%3Fepisode%3D1&text=Listening%20to%20%22My%20Episode%22'
    )
  })
})

describe('buildFacebookIntentUrl', () => {
  it('encodes the share URL into a Facebook sharer URL', () => {
    const intent = buildFacebookIntentUrl('https://example.com/?episode=1')
    expect(intent).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2F%3Fepisode%3D1')
  })
})
