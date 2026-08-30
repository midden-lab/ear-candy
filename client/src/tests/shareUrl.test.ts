import { describe, it, expect } from 'vitest'
import { buildShareUrl, buildTweetIntentUrl, buildFacebookIntentUrl, buildBlueskyIntentUrl } from '../utils/shareUrl'

describe('buildShareUrl', () => {
  it('builds a URL with just the episode id (and ref=share) when no timestamp is given', () => {
    const url = buildShareUrl(123)
    expect(url).toBe(`${window.location.origin}/?episode=123&ref=share`)
  })

  it('includes a t param when a positive timestamp is given', () => {
    const url = buildShareUrl(123, 754)
    expect(url).toBe(`${window.location.origin}/?episode=123&t=754&ref=share`)
  })

  it('floors a fractional timestamp', () => {
    const url = buildShareUrl(123, 754.9)
    expect(url).toContain('t=754')
  })

  it('omits t entirely for a zero or undefined timestamp', () => {
    expect(buildShareUrl(123, 0)).toBe(`${window.location.origin}/?episode=123&ref=share`)
    expect(buildShareUrl(123, undefined)).toBe(`${window.location.origin}/?episode=123&ref=share`)
  })

  it('always includes ref=share so a shared visit can be attributed by trackPageView()', () => {
    expect(buildShareUrl(1)).toContain('ref=share')
    expect(buildShareUrl(1, 30)).toContain('ref=share')
  })
})

describe('buildTweetIntentUrl', () => {
  it('encodes the share URL and episode title into a tweet intent URL', () => {
    const intent = buildTweetIntentUrl('https://example.com/?episode=1', 'My Episode')
    expect(intent).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.com%2F%3Fepisode%3D1&text=Listening%20to%20%22My%20Episode%22'
    )
  })

  it('safely encodes a title containing quotes and HTML (issue #56)', () => {
    const intent = buildTweetIntentUrl('https://example.com/?episode=1', 'Episode "Two": <b>Cool</b>')
    // encodeURIComponent handles quotes/angle-brackets/etc. safely — assert
    // the raw characters never appear unencoded in the resulting URL.
    expect(intent).not.toContain('"')
    expect(intent).not.toContain('<')
    expect(intent).not.toContain('>')
    expect(intent).toContain(encodeURIComponent('Listening to "Episode "Two": <b>Cool</b>"'))
  })
})

describe('buildFacebookIntentUrl', () => {
  it('encodes the share URL into a Facebook sharer URL', () => {
    const intent = buildFacebookIntentUrl('https://example.com/?episode=1')
    expect(intent).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2F%3Fepisode%3D1')
  })
})

describe('buildBlueskyIntentUrl', () => {
  it('encodes the episode title and share URL together into the post text', () => {
    const intent = buildBlueskyIntentUrl('https://example.com/?episode=1', 'My Episode')
    expect(intent).toBe(
      'https://bsky.app/intent/compose?text=Listening%20to%20%22My%20Episode%22%0Ahttps%3A%2F%2Fexample.com%2F%3Fepisode%3D1'
    )
  })

  it('safely encodes a title containing quotes and HTML (issue #56)', () => {
    const intent = buildBlueskyIntentUrl('https://example.com/?episode=1', 'Episode "Two": <b>Cool</b>')
    expect(intent).not.toContain('"')
    expect(intent).not.toContain('<')
    expect(intent).not.toContain('>')
    const decoded = decodeURIComponent(intent.split('text=')[1])
    expect(decoded).toBe('Listening to "Episode "Two": <b>Cool</b>"\nhttps://example.com/?episode=1')
  })
})
