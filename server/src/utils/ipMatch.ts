/**
 * Strips the IPv4-mapped-IPv6 prefix (e.g. "::ffff:203.0.113.5" ->
 * "203.0.113.5") so the same address matches regardless of which form a
 * given network path surfaces it as. Trims whitespace. Case-insensitive
 * on the "::ffff:" prefix; returns the input unchanged (trimmed) if it
 * doesn't match that shape.
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim()
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)
  return match ? match[1] : trimmed
}

/** Parses a comma-separated IP list (as stored in
 *  settings.excluded_analytics_ips) into normalized, non-empty entries. */
export function parseExcludedIps(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(normalizeIp).filter(Boolean)
}

/** True if `ip` matches any entry in the comma-separated `excludedRaw`
 *  list, after normalizing both sides. */
export function isExcludedIp(ip: string, excludedRaw: string | null | undefined): boolean {
  const excluded = parseExcludedIps(excludedRaw)
  return excluded.length > 0 && excluded.includes(normalizeIp(ip))
}
