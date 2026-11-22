import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { requireAdmin } from '../../auth.js'
import { peekHeader, matchesImageSignature } from '../../utils/magicBytes.js'
import { removeFileQuietly } from '../../utils/mediaFiles.js'

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Cover art never legitimately needs to be large — cap well below the
// audio route's 500MB limit to bound how much memory a single upload can
// consume while we buffer it for sharp.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

const THUMB_SIZE = 150
const DETAIL_SIZE = 640

// Cover art is shown at 150px and 640px, so a source this large is already
// far beyond anything useful (a 16-megapixel phone photo is comfortably
// under it). Bounds the memory libvips will commit to decoding one image
// (security audit M3, alongside the content check below).
const SHARP_OPTIONS = { limitInputPixels: 50_000_000 }
// Same text the route has always used for non-image content, so the response
// contract is unchanged whether the bytes fail the signature check or sharp.
const NOT_AN_IMAGE_ERROR = 'Uploaded file is not a valid image'

/** Maps a sharp failure to a clean 400 message — never leak the raw error. */
function describeSharpFailure(err: unknown): string {
  return /pixel limit/i.test(err instanceof Error ? err.message : '')
    ? 'Image dimensions exceed the 50 megapixel limit'
    : 'Uploaded file is not a valid image'
}

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

    // Extension and MIME type are both client-supplied. Check the real
    // leading bytes BEFORE buffering the rest or handing anything to sharp,
    // which decodes by content and would otherwise happily process an SVG,
    // GIF, TIFF, etc. renamed to .png (security audit M3).
    const { head, stream } = await peekHeader(data.file)
    if (!matchesImageSignature(head)) {
      stream.resume()
      return reply.status(400).send({ error: NOT_AN_IMAGE_ERROR })
    }

    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const buffer = Buffer.concat(chunks)
    if (data.file.truncated) {
      return reply.status(400).send({ error: 'Image exceeds the 15MB upload limit' })
    }

    // Secondary validation layer: sharp throws on bytes that aren't
    // actually a decodable image, or whose dimensions exceed the pixel
    // limit.
    try {
      await sharp(buffer, SHARP_OPTIONS).metadata()
    } catch (err) {
      return reply.status(400).send({ error: describeSharpFailure(err) })
    }

    const uploadsDir = path.resolve('data/uploads/images')
    await fs.mkdir(uploadsDir, { recursive: true })

    const uuid = randomUUID()
    const thumbFilename = `${uuid}-thumb.webp`
    const detailFilename = `${uuid}-detail.webp`

    // A file can have a valid header and still fail to decode (corrupt or
    // truncated body). That's bad input, not a server fault: answer 400,
    // and never leave half-written outputs behind in the public dir.
    try {
      await Promise.all([
        sharp(buffer, SHARP_OPTIONS)
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'center' })
          .webp()
          .toFile(path.join(uploadsDir, thumbFilename)),
        sharp(buffer, SHARP_OPTIONS)
          .resize(DETAIL_SIZE, DETAIL_SIZE, { fit: 'cover', position: 'center' })
          .webp()
          .toFile(path.join(uploadsDir, detailFilename)),
      ])
    } catch (err) {
      await Promise.all([
        removeFileQuietly(path.join(uploadsDir, thumbFilename)),
        removeFileQuietly(path.join(uploadsDir, detailFilename)),
      ])
      return reply.status(400).send({ error: describeSharpFailure(err) })
    }

    return {
      thumb: `/images/${thumbFilename}`,
      detail: `/images/${detailFilename}`,
    }
  })
}
