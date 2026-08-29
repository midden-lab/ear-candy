import { describe, it, expect } from 'vitest'
import { parseUserAgent } from '../src/utils/userAgent.js'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
}

describe('parseUserAgent', () => {
  it('buckets iPhone Safari', () => {
    expect(parseUserAgent(UA.iphoneSafari)).toEqual({ deviceType: 'mobile', os: 'iOS', browser: 'Safari' })
  })

  it('buckets Android Chrome', () => {
    expect(parseUserAgent(UA.androidChrome)).toEqual({ deviceType: 'mobile', os: 'Android', browser: 'Chrome' })
  })

  it('buckets iPad Safari as tablet', () => {
    expect(parseUserAgent(UA.ipadSafari)).toEqual({ deviceType: 'tablet', os: 'iOS', browser: 'Safari' })
  })

  it('buckets desktop macOS Safari', () => {
    expect(parseUserAgent(UA.macSafari)).toEqual({ deviceType: 'desktop', os: 'macOS', browser: 'Safari' })
  })

  it('buckets desktop macOS Chrome', () => {
    expect(parseUserAgent(UA.macChrome)).toEqual({ deviceType: 'desktop', os: 'macOS', browser: 'Chrome' })
  })

  it('buckets desktop Windows Chrome', () => {
    expect(parseUserAgent(UA.windowsChrome)).toEqual({ deviceType: 'desktop', os: 'Windows', browser: 'Chrome' })
  })

  it('buckets desktop Windows Firefox', () => {
    expect(parseUserAgent(UA.windowsFirefox)).toEqual({ deviceType: 'desktop', os: 'Windows', browser: 'Firefox' })
  })

  it('buckets desktop Linux Firefox', () => {
    expect(parseUserAgent(UA.linuxFirefox)).toEqual({ deviceType: 'desktop', os: 'Linux', browser: 'Firefox' })
  })

  it('buckets Windows Edge as Edge, not Chrome, despite the UA containing both tokens', () => {
    expect(parseUserAgent(UA.windowsEdge)).toEqual({ deviceType: 'desktop', os: 'Windows', browser: 'Edge' })
  })

  it('buckets an Android tablet (no Mobile token) as tablet, not mobile', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    expect(parseUserAgent(ua)).toEqual({ deviceType: 'tablet', os: 'Android', browser: 'Chrome' })
  })

  it('returns desktop/null/null for undefined input without throwing', () => {
    expect(parseUserAgent(undefined)).toEqual({ deviceType: 'desktop', os: null, browser: null })
  })

  it('returns desktop/null/null for an empty string', () => {
    expect(parseUserAgent('')).toEqual({ deviceType: 'desktop', os: null, browser: null })
  })

  it('returns desktop/null/null for an unrecognized UA string', () => {
    expect(parseUserAgent('SomeUnknownBot/1.0')).toEqual({ deviceType: 'desktop', os: null, browser: null })
  })
})
