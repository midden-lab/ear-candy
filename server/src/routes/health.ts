import type { FastifyPluginAsync } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, boolean> = { db: false, uploads: false }

    try {
      app.db.prepare('SELECT 1').get()
      checks.db = true
    } catch (err) {
      app.log.error({ err }, 'health check: db unreachable')
    }

    try {
      const uploadsDir = path.resolve('data/uploads')
      // mkdirSync with recursive is a no-op if the dir already exists, so this
      // doubles as the writability check without depending on app.ts having
      // created the dir already (e.g. in-memory-DB test apps skip that step).
      fs.mkdirSync(uploadsDir, { recursive: true })
      fs.accessSync(uploadsDir, fs.constants.W_OK)
      checks.uploads = true
    } catch (err) {
      app.log.error({ err }, 'health check: uploads dir not writable')
    }

    const healthy = checks.db && checks.uploads
    return reply.status(healthy ? 200 : 503).send({ ok: healthy, checks })
  })
}
