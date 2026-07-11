/**
 * Accepts local uploaded media paths (produced by POST /admin/upload, always
 * "/audio/<uuid>.<ext>") and absolute http(s) URLs; rejects javascript:,
 * data:, file:, and any other scheme that a browser might otherwise act on
 * when the value is later set on an <img>/<audio> src.
 */
export function isValidMediaPath(value: string): boolean {
  if (value.startsWith('/audio/')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
