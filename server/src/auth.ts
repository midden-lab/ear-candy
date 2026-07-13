import type { FastifyRequest, FastifyReply } from 'fastify'

// A stolen/exfiltrated session cookie must not be valid forever (issue #30).
// The signed cookie value carries its own issued-at timestamp so
// requireAdmin can reject it once it's too old, independent of the
// browser-side cookie maxAge (which a manipulated/replayed client could
// otherwise ignore).
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const SESSION_MARKER = 'authenticated'

export function buildSessionCookieValue(): string {
  return `${SESSION_MARKER}:${Date.now()}`
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
  const [marker, issuedAtStr] = result.value.split(':')
  const issuedAt = Number(issuedAtStr)
  if (marker !== SESSION_MARKER || !Number.isFinite(issuedAt)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
