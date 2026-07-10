import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import path from 'node:path'
import fs from 'node:fs'
import type { Database } from 'better-sqlite3'
import { initDb } from './db/index.js'
import { settingsRoute } from './routes/settings.js'
import { seasonsRoute } from './routes/seasons.js'
import { episodesRoute } from './routes/episodes.js'
import { adminAuthRoute } from './routes/admin/auth.js'
import { adminSeasonsRoute } from './routes/admin/seasons.js'
import { adminEpisodesRoute } from './routes/admin/episodes.js'
import { adminUploadRoute } from './routes/admin/upload.js'
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
  const app = Fastify({ logger: opts.logger ?? true })
  const dbPath = opts.dbPath ?? path.resolve('data/db.sqlite')
  const db = initDb(dbPath)

  app.decorate('db', db)

  app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-secret-change-in-production'
  })

  app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

  if (dbPath !== ':memory:') {
    const uploadsDir = path.resolve('data/uploads')
    app.register(staticPlugin, { root: uploadsDir, prefix: '/audio/' })
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

  if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
    throw new Error('COOKIE_SECRET env var is required in production')
  }

  app.register(settingsRoute, { prefix: '/api' })
  app.register(seasonsRoute, { prefix: '/api' })
  app.register(episodesRoute, { prefix: '/api' })
  app.register(adminAuthRoute, { prefix: '/api' })
  app.register(adminSeasonsRoute, { prefix: '/api' })
  app.register(adminEpisodesRoute, { prefix: '/api' })
  app.register(adminUploadRoute, { prefix: '/api' })
  app.register(adminSettingsRoute, { prefix: '/api' })

  return app
}
