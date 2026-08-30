export interface ParsedUserAgent {
  deviceType: 'mobile' | 'tablet' | 'desktop'
  os: string | null
  browser: string | null
}

// Coarse, regex-based bucketing for analytics breakdowns only — same spirit
// as isKnownCrawler() in crawler.ts, deliberately not a fingerprinting-grade
// parse (no version numbers, no exhaustive browser-fork coverage). Order
// matters within each category: more specific patterns are checked first
// so a broader one (e.g. "Safari" appearing in every Chrome UA too) doesn't
// shadow it.

function detectDeviceType(ua: string): ParsedUserAgent['deviceType'] {
  if (/iPad/i.test(ua)) return 'tablet'
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet'
  if (/Mobile|iPhone/i.test(ua)) return 'mobile'
  return 'desktop'
}

function detectOs(ua: string): string | null {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return null
}

function detectBrowser(ua: string): string | null {
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua)) return 'Safari'
  return null
}

export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  if (!userAgent) return { deviceType: 'desktop', os: null, browser: null }
  return {
    deviceType: detectDeviceType(userAgent),
    os: detectOs(userAgent),
    browser: detectBrowser(userAgent),
  }
}
