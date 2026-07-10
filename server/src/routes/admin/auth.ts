import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import { requireAdmin } from '../../auth.js'

export const adminAuthRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { password: string } }>('/admin/login', async (req, reply) => {
    const hash = process.env.ADMIN_PASSWORD_HASH
    if (!hash) {
      return reply.status(500).send({ error: 'Server misconfigured' })
    }

    const { password } = req.body
    const match = await bcrypt.compare(password, hash)
    if (!match) {
      return reply.status(401).send({ error: 'Invalid password' })
    }

    reply.setCookie('admin_session', 'authenticated', {
      signed: true,
      httpOnly: true,
      path: '/'
    })
    return { ok: true }
  })

  app.post('/admin/logout', async (_req, reply) => {
    reply.clearCookie('admin_session', { path: '/' })
    return { ok: true }
  })

  app.get('/admin/session', { preHandler: requireAdmin }, async (_req, reply) => {
    return reply.send({ authenticated: true })
  })
}
