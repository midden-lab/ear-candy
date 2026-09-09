import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Settings } from '../types'

vi.mock('../api', () => ({
  getSettings: vi.fn(),
}))

import { getSettings } from '../api'
import {
  trackPageView, trackPlayStart, trackListenProgress, trackPlayComplete,
  __resetAnalyticsConfigForTests,
} from '../utils/analytics'

const BASE_SETTINGS: Settings = {
  podcast_name: 'Test Pod',
  tagline: '',
  description: '',
  cover_art_path: null,
  favicon_path: null,
  browser_tab_title: null,
  accent_color: '#000000',
  analytics_enabled: true,
  track_returning_listeners: true,
  excluded_analytics_ips: null,
}

function mockSettings(overrides: Partial<Settings> = {}) {
  vi.mocked(getSettings).mockResolvedValue({ ...BASE_SETTINGS, ...overrides })
}

// track*() is fire-and-forget async internally (await loadConfig() chains
// through getSettings().then().catch() before doing anything else), so a
// fixed number of manually-counted `await Promise.resolve()` ticks is
// fragile — it happened to pass for some assertions here for the wrong
// reason (the code just hadn't run yet, not because it ran and confirmed
// "not called"). A macrotask boundary reliably drains every pending
// microtask ahead of it, so this is a genuine "let all track* work finish"
// wait, not a guess at chain depth.
async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

// jsdom's Blob implementation doesn't support the standard .text()/
// .arrayBuffer() methods, so read via FileReader instead — the one Blob
// content-reading path jsdom fully implements.
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('analytics utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetAnalyticsConfigForTests()
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    Object.defineProperty(document, 'referrer', { value: '', configurable: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('when analytics_enabled is false', () => {
    it('never calls sendBeacon or fetch', async () => {
      mockSettings({ analytics_enabled: false })
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

      trackPageView()
      await flush()

      expect(sendBeacon).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('session id storage', () => {
    it('writes the session id to localStorage when track_returning_listeners is true', async () => {
      mockSettings({ track_returning_listeners: true })
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })

      trackPageView()
      await flush()

      expect(sendBeacon).toHaveBeenCalledTimes(1)
      expect(window.localStorage.getItem('ec_session_id')).not.toBeNull()
      expect(window.sessionStorage.getItem('ec_session_id')).toBeNull()
    })

    it('writes the session id to sessionStorage when track_returning_listeners is false', async () => {
      mockSettings({ track_returning_listeners: false })
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })

      trackPageView()
      await flush()

      expect(sendBeacon).toHaveBeenCalledTimes(1)
      expect(window.sessionStorage.getItem('ec_session_id')).not.toBeNull()
      expect(window.localStorage.getItem('ec_session_id')).toBeNull()
    })

    it('reuses the same session id across multiple calls', async () => {
      mockSettings({ track_returning_listeners: true })
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })

      trackPageView()
      await flush()
      const id1 = window.localStorage.getItem('ec_session_id')
      expect(id1).not.toBeNull()

      trackPlayStart(1, 2)
      await flush()
      trackPlayComplete(1, 2)
      await flush()

      expect(sendBeacon).toHaveBeenCalledTimes(3)
      expect(window.localStorage.getItem('ec_session_id')).toBe(id1)

      const texts = await Promise.all(sendBeacon.mock.calls.map(call => readBlobText(call[1] as Blob)))
      const sessionIds = texts.map(t => JSON.parse(t).session_id)
      expect(new Set(sessionIds).size).toBe(1)
      expect(sessionIds[0]).toBe(id1)
    })
  })

  describe('trackPageView referrer resolution', () => {
    it('sends "share-link" when ?ref=share is present', async () => {
      mockSettings()
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })
      window.history.replaceState(null, '', '/?episode=5&ref=share')

      trackPageView()
      await flush()

      expect(sendBeacon).toHaveBeenCalledTimes(1)
      const blob = sendBeacon.mock.calls[0][1] as Blob
      const text = await readBlobText(blob)
      expect(JSON.parse(text).referrer).toBe('share-link')
    })

    it('falls back to document.referrer, reduced to just its origin, when ?ref=share is absent', async () => {
      mockSettings()
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })
      Object.defineProperty(document, 'referrer', { value: 'https://podcasts.example/', configurable: true })

      trackPageView()
      await flush()

      expect(sendBeacon).toHaveBeenCalledTimes(1)
      const blob = sendBeacon.mock.calls[0][1] as Blob
      const text = await readBlobText(blob)
      expect(JSON.parse(text).referrer).toBe('https://podcasts.example')
    })

    it('strips a PII-bearing query string from document.referrer, keeping only the origin', async () => {
      mockSettings()
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })
      Object.defineProperty(document, 'referrer', {
        value: 'https://newsletter.example/click?recipient=listener@example.com&campaign=42',
        configurable: true,
      })

      trackPageView()
      await flush()

      const blob = sendBeacon.mock.calls[0][1] as Blob
      const text = await readBlobText(blob)
      expect(JSON.parse(text).referrer).toBe('https://newsletter.example')
    })

    it('omits referrer entirely when document.referrer is not a valid URL', async () => {
      mockSettings()
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })
      Object.defineProperty(document, 'referrer', { value: 'not-a-url', configurable: true })

      trackPageView()
      await flush()

      const blob = sendBeacon.mock.calls[0][1] as Blob
      const text = await readBlobText(blob)
      expect(JSON.parse(text).referrer).toBeUndefined()
    })
  })

  describe('clearing the persistent identifier when returning-listener tracking is off', () => {
    it('removes a pre-existing localStorage session id once track_returning_listeners is false', async () => {
      window.localStorage.setItem('ec_session_id', 'stale-persistent-id')
      mockSettings({ track_returning_listeners: false })
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })

      trackPageView()
      await flush()

      expect(window.localStorage.getItem('ec_session_id')).toBeNull()
    })

    it('leaves an existing localStorage session id alone when track_returning_listeners is true', async () => {
      window.localStorage.setItem('ec_session_id', 'kept-persistent-id')
      mockSettings({ track_returning_listeners: true })
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })

      trackPageView()
      await flush()

      expect(window.localStorage.getItem('ec_session_id')).toBe('kept-persistent-id')
    })
  })

  describe('delivery fallback', () => {
    it('uses fetch with keepalive when sendBeacon is unavailable', async () => {
      mockSettings()
      vi.stubGlobal('navigator', {})
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

      trackPlayStart(1, 2)
      await flush()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0]
      expect(url).toBe('/api/analytics/event')
      expect(init).toMatchObject({ method: 'POST', keepalive: true })
    })

    it('swallows a rejected fetch fallback without throwing', async () => {
      mockSettings()
      vi.stubGlobal('navigator', {})
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

      expect(() => trackPlayComplete(1, 2)).not.toThrow()
      await flush()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when getSettings rejects', () => {
    it('sends nothing and does not throw', async () => {
      vi.mocked(getSettings).mockRejectedValue(new Error('offline'))
      const sendBeacon = vi.fn()
      vi.stubGlobal('navigator', { sendBeacon })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

      expect(() => trackListenProgress(1, 2, 25)).not.toThrow()
      await flush()

      expect(sendBeacon).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
