import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { parseFile } from 'music-metadata'
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

    // Determine duration server-side now that the file is fully on disk,
    // rather than trusting a client-side probe — see
    // client/src/pages/admin/EpisodeFormPanel.tsx's probeAudioDuration doc
    // comment and CLAUDE.md gotcha #37/#152 for why: the client-side probe
    // raced a fixed timeout against this podcast's typical ~55-58MB
    // uploads and lost repeatedly in production. A failed parse here
    // doesn't invalidate the upload — the file already passed magic-byte
    // validation above as real audio; an unparseable duration is a missing
    // signal, not an invalid upload (mirrors probeAudioDuration's own
    // "never block saving" philosophy).
    let durationSeconds = 0
    try {
      const metadata = await parseFile(dest)
      const duration = metadata.format.duration
      if (Number.isFinite(duration) && duration! > 0) {
        durationSeconds = Math.round(duration!)
      }
    } catch {
      // Leave durationSeconds at 0 — see comment above.
    }

    return { path: `/audio/${filename}`, duration_seconds: durationSeconds }
  })
}
