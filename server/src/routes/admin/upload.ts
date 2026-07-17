import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { requireAdmin } from '../../auth.js'
import { peekHeader, matchesAudioSignature } from '../../utils/magicBytes.js'

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.wav', '.ogg', '.oga', '.flac', '.aac', '.webm'
])

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav',
  'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/flac', 'audio/aac',
  'audio/webm'
])

export const adminUploadRoute: FastifyPluginAsync = async (app) => {
  app.post('/admin/upload', { preHandler: requireAdmin }, async (req, reply) => {
    const data = await req.file()
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const ext = path.extname(data.filename).toLowerCase()
    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext) || !ALLOWED_AUDIO_MIME_TYPES.has(data.mimetype)) {
      // Drain the stream so the connection doesn't hang, then reject.
      data.file.resume()
      return reply.status(400).send({ error: 'Only audio file uploads are allowed' })
    }

    // Extension/mimetype are both client-supplied and trivially spoofable —
    // check the file's actual leading bytes match a real audio container/
    // frame signature before ever writing it to disk (issue #38).
    const { head, stream } = await peekHeader(data.file)
    if (!matchesAudioSignature(head, ext)) {
      stream.resume()
      return reply.status(400).send({ error: 'File content does not match a recognized audio format' })
    }

    const filename = `${randomUUID()}${ext}`
    const dest = path.resolve('data/uploads', filename)

    await pipeline(stream, fs.createWriteStream(dest))

    return { path: `/audio/${filename}` }
  })
}
