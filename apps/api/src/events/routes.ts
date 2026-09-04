import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '@agora/db'
import { isAppError } from '../errors.js'
import { clientIp } from './hash.js'
import { ingestEvents } from './ingest.js'

export type EventsContext = {
  db: Db
  ipHashSalt: string
}

function userAgentOf(req: FastifyRequest): string {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua : ''
}

export function registerEventRoutes(app: FastifyInstance, ctx: EventsContext) {
  const handler = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
    try {
      await ingestEvents(ctx.db, req.body, {
        ip: clientIp(req),
        userAgent: userAgentOf(req),
        salt: ctx.ipHashSalt,
      })
      return reply.code(204).send()
    } catch (err) {
      if (isAppError(err)) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  }

  app.post('/v1/events', handler)
}
