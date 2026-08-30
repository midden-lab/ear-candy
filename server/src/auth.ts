import type { FastifyRequest, FastifyReply } from 'fastify'

// A stolen/exfiltrated session cookie must not be valid forever (issue #30).
// The signed cookie value carries its own issued-at timestamp so
// requireAdmin can reject it once it's too old, independent of the
// browser-side cookie maxAge (which a manipulated/replayed client could
// otherwise ignore).
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const SESSION_MARKER = 'authenticated'

// The cookie also carries the settings.session_epoch value that was current
// at issuance (issue #34 / red-team AUTH-1). Logout bumps that column,
// which immediately invalidates every outstanding cookie server-side
// (there's exactly one admin, so a single monotonic counter is enough —
// no per-session store needed). Without this, logout only ever cleared the
// browser-side cookie: a copy obtained any other way (XSS, a compromised
// browser profile, a captured log) stayed valid for up to 24h regardless.
export function buildSessionCookieValue(epoch: number): string {
  return `${SESSION_MARKER}:${Date.now()}:${epoch}`
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = req.cookies['admin_session'] ?? ''
  if (!raw) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const result = req.unsignCookie(raw)
  if (!result.valid || !result.value) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const [marker, issuedAtStr, epochStr] = result.value.split(':')
  const issuedAt = Number(issuedAtStr)
  const epoch = Number(epochStr)
  // A cookie issued before this change (`authenticated:<ts>`, no third
  // segment) fails the epoch check cleanly here — 401, not a crash — the
  // same intentional forced-logout-on-deploy behavior already established
  // when the 24h expiry itself was added (see the SESSION_MAX_AGE_MS
  // history above, issue #30).
  if (marker !== SESSION_MARKER || !Number.isFinite(issuedAt) || !Number.isFinite(epoch)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const row = req.server.db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number } | undefined
  if (!row || row.session_epoch !== epoch) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
