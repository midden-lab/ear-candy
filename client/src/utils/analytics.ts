import { getSettings } from '../api'
import type { AnalyticsEventType } from '../types'

const SESSION_STORAGE_KEY = 'ec_session_id'

interface AnalyticsConfig {
  analyticsEnabled: boolean
  trackReturning: boolean
}

// Memoized so every track* call doesn't refetch settings — this is a
// second /api/settings call beyond App.tsx's own, traded deliberately for
// not having to thread analytics_enabled/track_returning_listeners as
// props through AudioPlayer/AudioPlayerView just for this. A rejected
// fetch resolves to "disabled" (fail closed, not open) rather than
// throwing, so a settings-load hiccup never crashes a track* caller.
let configPromise: Promise<AnalyticsConfig> | null = null

function loadConfig(): Promise<AnalyticsConfig> {
  if (!configPromise) {
    configPromise = getSettings()
      .then(s => {
        const config = { analyticsEnabled: s.analytics_enabled, trackReturning: s.track_returning_listeners }
        // Disabling "track returning listeners" only changes which storage
        // getSessionId reads going forward — without this, a previously
        // written localStorage identifier sits dormant rather than deleted,
        // and would resume correlating history if the setting were ever
        // re-enabled.
        if (!config.trackReturning) {
          try { window.localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore */ }
        }
        return config
      })
      .catch(() => ({ analyticsEnabled: false, trackReturning: false }))
  }
  return configPromise
}

function getSessionId(persistent: boolean): string {
  const storage = persistent ? window.localStorage : window.sessionStorage
  const existing = storage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  storage.setItem(SESSION_STORAGE_KEY, id)
  return id
}

interface AnalyticsEventPayload {
  event_type: AnalyticsEventType
  episode_id?: number
  season_id?: number
  position_pct?: 25 | 50 | 75 | 90
  referrer?: string
}

async function sendAnalyticsEvent(payload: AnalyticsEventPayload): Promise<void> {
  const config = await loadConfig()
  if (!config.analyticsEnabled) return

  const session_id = getSessionId(config.trackReturning)
  const body = JSON.stringify({ ...payload, session_id })

  // sendBeacon survives tab-close/navigation, mirroring the reliability
  // pattern AudioPlayer.tsx already uses for eager position-saving on
  // visibilitychange/pagehide/offline — fall back to a keepalive fetch
  // where it isn't available. Must never throw into the caller: this is
  // fire-and-forget instrumentation, not something a track* caller awaits.
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/api/analytics/event', new Blob([body], { type: 'application/json' }))
  } else {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  }
}

// document.referrer can carry a PII-bearing query string (e.g. a
// newsletter/campaign link's recipient token) — only the origin is ever
// meaningful for "which site linked here," so that's all this stores.
function sanitizeReferrer(referrer: string): string | undefined {
  try {
    return new URL(referrer).origin
  } catch {
    return undefined
  }
}

export function trackPageView(): void {
  const params = new URLSearchParams(window.location.search)
  const referrer = params.get('ref') === 'share' ? 'share-link' : (document.referrer ? sanitizeReferrer(document.referrer) : undefined)
  void sendAnalyticsEvent({ event_type: 'page_view', referrer })
}

export function trackPlayStart(episodeId: number, seasonId: number): void {
  void sendAnalyticsEvent({ event_type: 'play_start', episode_id: episodeId, season_id: seasonId })
}

export function trackListenProgress(episodeId: number, seasonId: number, positionPct: 25 | 50 | 75 | 90): void {
  void sendAnalyticsEvent({ event_type: 'listen_progress', episode_id: episodeId, season_id: seasonId, position_pct: positionPct })
}

export function trackPlayComplete(episodeId: number, seasonId: number): void {
  void sendAnalyticsEvent({ event_type: 'play_complete', episode_id: episodeId, season_id: seasonId })
}

/** Test-only: clears the memoized settings promise so each test can mock
 *  getSettings() fresh instead of inheriting a previous test's result. */
export function __resetAnalyticsConfigForTests(): void {
  configPromise = null
}
