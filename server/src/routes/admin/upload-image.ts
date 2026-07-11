import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { requireAdmin } from '../../auth.js'

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Cover art never legitimately needs to be large — cap well below the
// audio route's 500MB limit to bound how much memory a single upload can
// consume while we buffer it for sharp.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

const THUMB_SIZE = 150
const DETAIL_SIZE = 640

export const adminUploadImageRoute: FastifyPluginAsync = async (app) => {
  app.post('/admin/upload/image', { preHandler: requireAdmin }, async (req, reply) => {
    const data = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES } })
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const ext = path.extname(data.filename).toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext) || !ALLOWED_IMAGE_MIME_TYPES.has(data.mimetype)) {
      data.file.resume()
      return reply.status(400).send({ error: 'Only JPEG, PNG, or WebP image uploads are allowed' })
    }

    const buffer = await data.toBuffer()
    if (data.file.truncated) {
      return reply.status(400).send({ error: 'Image exceeds the 15MB upload limit' })
    }

    // Secondary validation layer: sharp throws on bytes that aren't
    // actually a decodable image, catching a spoofed extension/mimetype
    // that the whitelist above doesn't sniff.
    try {
      await sharp(buffer).metadata()
    } catch {
      return reply.status(400).send({ error: 'Uploaded file is not a valid image' })
    }

    const uploadsDir = path.resolve('data/uploads/images')
    await fs.mkdir(uploadsDir, { recursive: true })

    const uuid = randomUUID()
    const thumbFilename = `${uuid}-thumb.webp`
    const detailFilename = `${uuid}-detail.webp`

    await Promise.all([
      sharp(buffer)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'center' })
        .webp()
        .toFile(path.join(uploadsDir, thumbFilename)),
      sharp(buffer)
        .resize(DETAIL_SIZE, DETAIL_SIZE, { fit: 'cover', position: 'center' })
        .webp()
        .toFile(path.join(uploadsDir, detailFilename)),
    ])

    return {
      thumb: `/images/${thumbFilename}`,
      detail: `/images/${detailFilename}`,
    }
  })
}
