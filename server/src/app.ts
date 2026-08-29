import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import path from 'node:path'
import fs from 'node:fs'
import type { Database } from 'better-sqlite3'
import { initDb } from './db/index.js'
import { healthRoute } from './routes/health.js'
import { settingsRoute } from './routes/settings.js'
import { seasonsRoute } from './routes/seasons.js'
import { episodesRoute } from './routes/episodes.js'
import { analyticsRoute } from './routes/analytics.js'
import { adminAuthRoute } from './routes/admin/auth.js'
import { adminSeasonsRoute } from './routes/admin/seasons.js'
import { adminEpisodesRoute } from './routes/admin/episodes.js'
import { adminUploadRoute } from './routes/admin/upload.js'
import { adminUploadImageRoute } from './routes/admin/upload-image.js'
import { adminUploadFaviconRoute } from './routes/admin/upload-favicon.js'
import { adminSettingsRoute } from './routes/admin/settings.js'
import { adminAnalyticsRoute } from './routes/admin/analytics.js'
import { isKnownCrawler, renderEpisodeOgHtml, resolveConfiguredOrigin } from './utils/crawler.js'
import type { Episode, Settings } from './types.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
  }
}

interface AppOptions {
  dbPath?: string
  logger?: boolean
  clientDistPath?: string
}

// Production sits behind Caddy, reverse-proxying to the app container's
// published port — without trustProxy, Fastify's req.ip is the direct TCP
// peer, collapsing every real visitor into one shared IP for things like
// the login lockout counter (issue #33: one attacker's failed attempts
// could lock out the real admin too). Loopback (127.0.0.1/::1) was the
// first fix attempted here, but it doesn't actually work in production:
// Caddy runs on the Droplet host while the app runs in a container
// published via `docker run -p 3000:3000`, and Docker NATs that
// host-to-container connection through the bridge network — from inside
// the container, Caddy's connection appears to originate from the bridge
// gateway address (e.g. 172.17.0.1), not loopback. That address is a
// property of this specific deployment's Docker networking, not something
// to hardcode into application source (a custom network, a different
// bridge subnet, or moving off this exact setup would silently break it
// again) — so it's configurable via TRUSTED_PROXY_IPS (comma-separated),
// with the deploy job (.github/workflows/ci-cd.yml) responsible for
// setting the real value for this deployment. Defaults to loopback-only
// when unset, which is what local dev/CI/e2e actually sit behind (no
// proxy at all there, so loopback-only remains a safe, correct default).
const MIN_COOKIE_SECRET_LENGTH = 32

export function resolveTrustedProxies(value: string | undefined): string[] {
  const defaults = ['127.0.0.1', '::1']
  if (!value) return defaults
  const parsed = value.split(',').map(s => s.trim()).filter(Boolean)
  return parsed.length > 0 ? parsed : defaults
}

export function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: resolveTrustedProxies(process.env.TRUSTED_PROXY_IPS) })
  const dbPath = opts.dbPath ?? path.resolve('data/db.sqlite')
  const db = initDb(dbPath)

  app.decorate('db', db)

  const cookieSecret = process.env.COOKIE_SECRET
  if (!cookieSecret) {
    throw new Error('COOKIE_SECRET env var is required')
  }
  // Only presence was checked before, not strength — an operator
  // hand-editing .env could set a trivially short/guessable secret, letting
  // an attacker forge valid session cookies offline via HMAC brute-force
  // (issue #40). `make setup`'s generated secrets (openssl rand -hex 32,
  // 64 hex chars) clear this floor comfortably.
  if (cookieSecret.length < MIN_COOKIE_SECRET_LENGTH) {
    throw new Error(`COOKIE_SECRET must be at least ${MIN_COOKIE_SECRET_LENGTH} characters (got ${cookieSecret.length})`)
  }
  app.register(cookie, { secret: cookieSecret })

  app.register(helmet, {
    // HSTS is deliberately left off: this is self-hosted software with
    // variable deployment topology. A wrong HSTS header (e.g. an operator
    // running behind a proxy without TLS, or accessing directly over LAN)
    // makes browsers refuse plain HTTP for the cache duration — a far
    // worse footgun than the header's upside. TLS enforcement belongs in
    // the reverse proxy in front (e.g. the Caddy setup in scripts/), not
    // baked into the app.
    hsts: false,
    // Helmet defaults X-Frame-Options to SAMEORIGIN; this app has no
    // same-origin framing use case, so deny outright (matches the CSP
    // frame-ancestors 'none' below — X-Frame-Options is the fallback for
    // browsers that don't honor CSP).
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React inline `style={{...}}` props are governed by style-src too,
        // not just <style> tags — 'unsafe-inline' is required for those to
        // keep working, not just for stylesheets.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        // Episodes may point at an external URL (audio_type: 'url'), so
        // media-src needs more than 'self'.
        mediaSrc: ["'self'", 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    }
  })

  // A generous backstop against genuinely abusive/scripted traffic, not a
  // fine-grained limit — a single admin's real browsing session (or an
  // automated test suite, which fires many requests per page load in rapid
  // succession) can easily exceed a tight per-minute cap from one IP.
  // Brute-force login protection is handled separately and precisely in
  // the login route itself (only failed attempts count there).
  app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute'
  })

  app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

  if (dbPath !== ':memory:') {
    const uploadsDir = path.resolve('data/uploads')
    fs.mkdirSync(uploadsDir, { recursive: true })
    app.register(staticPlugin, {
      root: uploadsDir,
      prefix: '/audio/',
      setHeaders: (reply) => {
        // Defense in depth: even if an unexpected file ever lands here,
        // browsers must not sniff/execute it as HTML/JS.
        reply.header('X-Content-Type-Options', 'nosniff')
      }
    })

    const imagesDir = path.resolve('data/uploads/images')
    fs.mkdirSync(imagesDir, { recursive: true })
    app.register(staticPlugin, {
      root: imagesDir,
      prefix: '/images/',
      decorateReply: false,
      setHeaders: (reply) => {
        reply.header('X-Content-Type-Options', 'nosniff')
        // Filenames are UUID-based and never mutated in place, so these can
        // be cached aggressively — meaningfully helps repeat visits on slow
        // cellular connections avoid re-fetching cover art at all.
        reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      }
    })
  }

  const clientDist = opts.clientDistPath ?? (
    process.env.SERVE_CLIENT === 'true' ? path.resolve('dist/client') : null
  )
  if (clientDist && fs.existsSync(clientDist)) {
    // Shared-episode links (?episode=X&t=Y) need a real preview card when a
    // social platform's bot fetches them — those bots never execute the
    // client bundle, so they'd otherwise always see the generic app shell.
    // This must run as an onRequest hook, not inside setNotFoundHandler
    // below: @fastify/static registers a real route for the exact path
    // `/`, which serves index.html directly and never falls through to the
    // not-found handler at all. onRequest fires before route matching, so
    // it's the only hook that sees every request regardless of which route
    // (if any) ends up handling it. Real browsers are completely
    // unaffected — this only short-circuits for a known crawler user agent
    // with a resolvable, visible episode id in the query string.
    app.addHook('onRequest', async (req, reply) => {
      // Scoped to exactly `/` — without this, a request to any other route
      // (e.g. an API endpoint) from a UA that happens to match the crawler
      // regex would be silently short-circuited into an OG-HTML response
      // instead of its real handler.
      if (req.method !== 'GET' || req.url.split('?')[0] !== '/') return
      if (!isKnownCrawler(req.headers['user-agent'])) return
      const episodeIdRaw = (req.query as Record<string, string> | undefined)?.episode
      const episodeId = episodeIdRaw !== undefined ? parseInt(episodeIdRaw, 10) : NaN
      if (isNaN(episodeId)) return
      const episode = app.db.prepare(`
        SELECT e.* FROM episodes e
        JOIN seasons s ON s.id = e.season_id
        WHERE e.id=? AND e.hidden=0 AND s.hidden=0
      `).get(episodeId) as Episode | undefined
      const settings = app.db.prepare('SELECT * FROM settings').get() as Settings | undefined
      if (!episode || !settings) return
      // Prefer an explicitly configured origin over the request's own
      // Host-derived one — see resolveConfiguredOrigin's doc comment (issue #53).
      const origin = resolveConfiguredOrigin(process.env.PUBLIC_ORIGIN) ?? `${req.protocol}://${req.hostname}`
      const shareUrl = `${origin}${req.url}`
      await reply.code(200).type('text/html').send(renderEpisodeOgHtml(episode, settings, shareUrl, origin))
    })

    app.register(staticPlugin, {
      root: clientDist,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
    })
    app.setNotFoundHandler((_req, reply) => {
      const indexPath = path.join(clientDist, 'index.html')
      const indexHtml = fs.readFileSync(indexPath, 'utf-8')
      void reply.code(200)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .type('text/html')
        .send(indexHtml)
    })
  }

  app.addHook('onClose', () => { db.close() })

  app.register(healthRoute, { prefix: '/api' })
  app.register(settingsRoute, { prefix: '/api' })
  app.register(seasonsRoute, { prefix: '/api' })
  app.register(episodesRoute, { prefix: '/api' })
  app.register(analyticsRoute, { prefix: '/api' })
  app.register(adminAuthRoute, { prefix: '/api' })
  app.register(adminSeasonsRoute, { prefix: '/api' })
  app.register(adminEpisodesRoute, { prefix: '/api' })
  app.register(adminUploadRoute, { prefix: '/api' })
  app.register(adminUploadImageRoute, { prefix: '/api' })
  app.register(adminUploadFaviconRoute, { prefix: '/api' })
  app.register(adminSettingsRoute, { prefix: '/api' })
  app.register(adminAnalyticsRoute, { prefix: '/api' })

  return app
}
