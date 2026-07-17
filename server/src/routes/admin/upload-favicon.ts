import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { requireAdmin } from '../../auth.js'
import { peekHeader, matchesFaviconSignature } from '../../utils/magicBytes.js'

// SVG deliberately excluded: unlike PNG/ICO, an SVG can embed <script> and a
// browser will execute it if the uploaded file is ever navigated to directly
// (not just used as a favicon) — a real stored-XSS path for a format that
// isn't needed here, since PNG/ICO already cover the favicon use case.
const ALLOWED_FAVICON_EXTENSIONS = new Set(['.png', '.ico'])
const ALLOWED_FAVICON_MIME_TYPES = new Set([
  'image/png', 'image/x-icon', 'image/vnd.microsoft.icon'
])

// Favicons are tiny — a generous cap that's still far below the general
// image upload limit, just to bound memory/disk from an oversized upload.
const MAX_FAVICON_BYTES = 2 * 1024 * 1024

export const adminUploadFaviconRoute: FastifyPluginAsync = async (app) => {
  app.post('/admin/upload/favicon', { preHandler: requireAdmin }, async (req, reply) => {
    const data = await req.file({ limits: { fileSize: MAX_FAVICON_BYTES } })
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const ext = path.extname(data.filename).toLowerCase()
    if (!ALLOWED_FAVICON_EXTENSIONS.has(ext) || !ALLOWED_FAVICON_MIME_TYPES.has(data.mimetype)) {
      data.file.resume()
      return reply.status(400).send({ error: 'Only PNG or ICO favicon uploads are allowed' })
    }

    const { head, stream } = await peekHeader(data.file)
    if (!matchesFaviconSignature(head, ext)) {
      stream.resume()
      return reply.status(400).send({ error: 'File content does not match a recognized PNG or ICO image' })
    }

    const uploadsDir = path.resolve('data/uploads/images')
    fs.mkdirSync(uploadsDir, { recursive: true })

    const filename = `favicon-${randomUUID()}${ext}`
    const dest = path.join(uploadsDir, filename)

    await pipeline(stream, fs.createWriteStream(dest))

    if (data.file.truncated) {
      fs.unlinkSync(dest)
      return reply.status(400).send({ error: 'Favicon exceeds the 2MB upload limit' })
    }

    return { path: `/images/${filename}` }
  })
}
