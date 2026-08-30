import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import { requireAdmin, buildSessionCookieValue, SESSION_MAX_AGE_MS } from '../../auth.js'

const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

// A second, IP-independent counter, layered onto the per-IP one above —
// not a tighter version of it. The per-IP lockout stops credential
// stuffing from one address; it does nothing against an attacker with
// access to many apparent source IPs, who gets a fresh 10-attempt
// allowance per address. This app has exactly one credential gating full
// content control, so a global backstop is worth the (deliberately
// higher, so a real admin's own occasional mistyped password from one IP
// essentially never trips it) ceiling below (red-team AUTH-2).
const GLOBAL_MAX_FAILED_ATTEMPTS = 30
const GLOBAL_LOCKOUT_WINDOW_MS = 30 * 60 * 1000

export const adminAuthRoute: FastifyPluginAsync = async (app) => {
  // Tracks failed login attempts per IP, not all requests — a legitimate
  // user (or an e2e suite) logging in repeatedly with the *correct*
  // password never touches this counter. Only someone actually guessing
  // wrong passwords gets throttled, which is the real brute-force scenario
  // this guards against. Scoped to this plugin instance (not module-level)
  // so each buildApp() call — including each test's fresh app — gets its
  // own isolated state.
  const failedAttempts = new Map<string, { count: number; resetAt: number }>()
  let globalFailed: { count: number; resetAt: number } | null = null

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

  function isGloballyLockedOut(): boolean {
    if (!globalFailed) return false
    if (Date.now() > globalFailed.resetAt) {
      globalFailed = null
      return false
    }
    return globalFailed.count >= GLOBAL_MAX_FAILED_ATTEMPTS
  }

  function recordGlobalFailedAttempt(): void {
    if (!globalFailed || Date.now() > globalFailed.resetAt) {
      globalFailed = { count: 1, resetAt: Date.now() + GLOBAL_LOCKOUT_WINDOW_MS }
    } else {
      globalFailed.count += 1
    }
  }

  app.post<{ Body: { password: string } }>('/admin/login', async (req, reply) => {
    // Deliberately the same 429 response either way — distinguishing
    // "your IP is locked" from "the whole app is locked" in the response
    // would hand an attacker a signal about which control they tripped.
    if (isLockedOut(req.ip) || isGloballyLockedOut()) {
      return reply.status(429).send({ error: 'Too many failed login attempts. Try again later.' })
    }

    const hash = process.env.ADMIN_PASSWORD_HASH
    if (!hash) {
      req.log.error('ADMIN_PASSWORD_HASH is not set')
      return reply.status(500).send({ error: 'Internal server error' })
    }

    const { password } = req.body
    const match = await bcrypt.compare(password, hash)
    if (!match) {
      recordFailedAttempt(req.ip)
      recordGlobalFailedAttempt()
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

  app.post('/admin/logout', async (req, reply) => {
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
