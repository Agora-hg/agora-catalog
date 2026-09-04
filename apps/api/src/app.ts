import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import Fastify from 'fastify'
import type { Db } from '@agora/db'
import { registerAnalyticsAdmin } from './admin/analytics-routes.js'
import { registerEventRoutes } from './events/routes.js'
import { catalogFixturePage } from './demo/catalog.js'

export type BuildAppOpts = {
  db: Db
  ipHashSalt: string
  sessionSecret: string
  cookieSecure?: boolean
  logger?: boolean
  fixture?: boolean
}

export async function buildApp(opts: BuildAppOpts) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true })

  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString('utf8') : '')
  })

  await app.register(cors, { origin: true })
  await app.register(cookie)
  await app.register(formbody)

  const ctx = {
    db: opts.db,
    sessionSecret: opts.sessionSecret,
    cookieSecure: opts.cookieSecure ?? false,
    ipHashSalt: opts.ipHashSalt,
  }

  app.get('/health', async () => ({ ok: true }))
  registerEventRoutes(app, ctx)
  registerAnalyticsAdmin(app, ctx)

  if (opts.fixture) {
    app.get('/demo/catalog', async (_req, reply) => {
      return reply.type('text/html').send(catalogFixturePage())
    })
  }

  return app
}
