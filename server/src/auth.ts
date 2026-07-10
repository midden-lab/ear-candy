import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = req.cookies['admin_session'] ?? ''
  if (!raw) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const result = req.unsignCookie(raw)
  if (!result.valid) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
