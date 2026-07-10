import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { requireAdmin } from '../../auth.js'

export const adminUploadRoute: FastifyPluginAsync = async (app) => {
  app.post('/admin/upload', { preHandler: requireAdmin }, async (req, reply) => {
    const data = await req.file()
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const ext = path.extname(data.filename)
    const filename = `${randomUUID()}${ext}`
    const dest = path.resolve('data/uploads', filename)

    await pipeline(data.file, fs.createWriteStream(dest))

    return { path: `/audio/${filename}` }
  })
}
