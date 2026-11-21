import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import { requireAdmin, buildSessionCookieValue, SESSION_MAX_AGE_MS } from '../../auth.js'

const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

// A second, IP-independent counter — observability only, it NEVER blocks.
// It used to hard-block every login (429) once 30 failures landed in 30
// minutes from any addresses combined (red-team AUTH-2), but a global hard
// block is itself a denial-of-service on the only admin credential: an
// attacker with a few source IPs could keep the real admin locked out,
// even with the correct password, indefinitely (security audit H2). Now it
// only emits one structured `warn` per window when the count reaches the
// old threshold, so a distributed guessing attempt is visible in the logs
// without handing an attacker a lever. Brute-force resistance rests on the
// bcrypt cost, the per-IP lockout above, and a strong admin password.
const GLOBAL_FAILURE_SPIKE_THRESHOLD = 30
const GLOBAL_FAILURE_WINDOW_MS = 30 * 60 * 1000

export const adminAuthRoute: FastifyPluginAsync = async (app) => {
  // Tracks failed login attempts per IP, not all requests — a legitimate
  // user (or an e2e suite) logging in repeatedly with the *correct*
  // password never touches this counter. Only someone actually guessing
  // wrong passwords gets throttled, which is the real brute-force scenario
  // this guards against. Scoped to this plugin instance (not module-level)
  // so each buildApp() call — including each test's fresh app — gets its
  // own isolated state.
  const failedAttempts = new Map<string, { count: number; resetAt: number }>()
  let globalFailed: { count: number; resetAt: number; spikeLogged: boolean } | null = null

  function isLockedOut(ip: string): boolean {
    const entry = failedAttempts.get(ip)
    if (!entry) return false
    if (Date.now() > entry.resetAt) {
      failedAttempts.delete(ip)
      return false
    }
    return entry.count >= MAX_FAILED_ATTEMPTS
  }

  function recordFailedAttempt(ip: string): void {
    const entry = failedAttempts.get(ip)
    if (!entry || Date.now() > entry.resetAt) {
      failedAttempts.set(ip, { count: 1, resetAt: Date.now() + LOCKOUT_WINDOW_MS })
    } else {
      entry.count += 1
    }
  }

  // Counts wrong-password attempts across all IPs and logs one warn per
  // window when the count reaches the threshold. Observability only.
  function recordGlobalFailedAttempt(log: { warn: (obj: object) => void }): void {
    if (!globalFailed || Date.now() > globalFailed.resetAt) {
      globalFailed = { count: 1, resetAt: Date.now() + GLOBAL_FAILURE_WINDOW_MS, spikeLogged: false }
    } else {
      globalFailed.count += 1
    }
    if (!globalFailed.spikeLogged && globalFailed.count >= GLOBAL_FAILURE_SPIKE_THRESHOLD) {
      globalFailed.spikeLogged = true
      log.warn({ event: 'admin_login_global_failure_spike', count: globalFailed.count })
    }
  }

  app.post<{ Body: { password?: unknown } | undefined }>('/admin/login', async (req, reply) => {
    if (isLockedOut(req.ip)) {
      return reply.status(429).send({ error: 'Too many failed login attempts. Try again later.' })
    }

    const hash = process.env.ADMIN_PASSWORD_HASH
    if (!hash) {
      req.log.error('ADMIN_PASSWORD_HASH is not set')
      return reply.status(500).send({ error: 'Internal server error' })
    }

    // A missing body or a non-string/empty password used to reach
    // bcrypt.compare, which throws, surfacing as a 500 with raw error text
    // (security audit M4). Reject it as a plain 400 instead. It still
    // counts toward this IP's own lockout counter, so garbage requests
    // can't be used to probe for free, but not toward the global spike
    // counter, which is about wrong-password guessing.
    const password = req.body?.password
    if (typeof password !== 'string' || password.length === 0) {
      recordFailedAttempt(req.ip)
      return reply.status(400).send({ error: 'password is required' })
    }

    const match = await bcrypt.compare(password, hash)
    if (!match) {
      recordFailedAttempt(req.ip)
      recordGlobalFailedAttempt(req.log)
      // Deliberately never logs the submitted password itself — only the
      // outcome and requesting IP, enough to answer "did someone get in,
      // and when" after the fact (issue #13) without logging credentials.
      req.log.info({ event: 'admin_login', outcome: 'failure', ip: req.ip })
      return reply.status(401).send({ error: 'Invalid password' })
    }

    failedAttempts.delete(req.ip)
    req.log.info({ event: 'admin_login', outcome: 'success', ip: req.ip })
    const { session_epoch } = app.db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number }
    reply.setCookie('admin_session', buildSessionCookieValue(session_epoch), {
      signed: true,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000 // @fastify/cookie expects seconds
    })
    return { ok: true }
  })

  // Requires a valid session (H1, plan 020 step 4). This used to be open to
  // anyone: an anonymous POST bumped session_epoch below and so revoked the
  // real admin's session on demand, repeatably. An already-expired or
  // revoked session simply gets a 401 — there's nothing left to revoke and
  // the browser-side cookie is useless once rejected, so no cookie clearing
  // is needed on that path; the client falls through to its logged-out view
  // regardless of the status code.
  app.post('/admin/logout', { preHandler: requireAdmin }, async (req, reply) => {
    req.log.info({ event: 'admin_logout', ip: req.ip })
    // Bumping the epoch invalidates every outstanding session cookie
    // server-side (issue #34), not just this browser's — there's only one
    // admin, so "logout" and "sign out everywhere" are the same operation.
    app.db.prepare('UPDATE settings SET session_epoch = session_epoch + 1').run()
    reply.clearCookie('admin_session', { path: '/' })
    return { ok: true }
  })

  app.get('/admin/session', { preHandler: requireAdmin }, async (_req, reply) => {
    return reply.send({ authenticated: true })
  })
}
