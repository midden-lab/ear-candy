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
import { adminAuthRoute } from './routes/admin/auth.js'
import { adminSeasonsRoute } from './routes/admin/seasons.js'
import { adminEpisodesRoute } from './routes/admin/episodes.js'
import { adminUploadRoute } from './routes/admin/upload.js'
import { adminUploadImageRoute } from './routes/admin/upload-image.js'
import { adminUploadFaviconRoute } from './routes/admin/upload-favicon.js'
import { adminSettingsRoute } from './routes/admin/settings.js'

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

export function buildApp(opts: AppOptions = {}) {
  // Production sits behind Caddy on the same host, reverse-proxying over
  // loopback (see scripts/setup-droplet.sh) — without trustProxy, Fastify's
  // req.ip is the direct TCP peer, which in production is always Caddy's
  // loopback address, collapsing every real visitor into one shared IP for
  // things like the login lockout counter (issue #33: one attacker's failed
  // attempts could lock out the real admin too). Trusting only loopback
  // means req.ip reflects the real client from X-Forwarded-For when the
  // immediate connection is from Caddy, while still refusing to trust
  // forwarded headers from any address that isn't the local reverse proxy.
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: ['127.0.0.1', '::1'] })
  const dbPath = opts.dbPath ?? path.resolve('data/db.sqlite')
  const db = initDb(dbPath)

  app.decorate('db', db)

  const cookieSecret = process.env.COOKIE_SECRET
  if (!cookieSecret) {
    throw new Error('COOKIE_SECRET env var is required')
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
  app.register(adminAuthRoute, { prefix: '/api' })
  app.register(adminSeasonsRoute, { prefix: '/api' })
  app.register(adminEpisodesRoute, { prefix: '/api' })
  app.register(adminUploadRoute, { prefix: '/api' })
  app.register(adminUploadImageRoute, { prefix: '/api' })
  app.register(adminUploadFaviconRoute, { prefix: '/api' })
  app.register(adminSettingsRoute, { prefix: '/api' })

  return app
}
