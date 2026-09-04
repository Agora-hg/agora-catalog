import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import Fastify from 'fastify'
import type { Db } from '@agora/db'
import { registerAdmin } from './admin/routes.ts'
import { getPublicCompany, listPublicCompanies } from './public/companies.ts'

export type BuildAppOpts = {
  db: Db
  sessionSecret: string
  cookieSecure?: boolean
  logger?: boolean
}

export async function buildApp(opts: BuildAppOpts) {
  const app = Fastify({ logger: opts.logger ?? false })
  await app.register(cookie)
  await app.register(formbody)

  const ctx = {
    db: opts.db,
    sessionSecret: opts.sessionSecret,
    cookieSecure: opts.cookieSecure ?? false,
  }

  app.get('/health', async () => ({ ok: true }))

  app.get('/v1/companies', async (req) => {
    const q = req.query as Record<string, unknown>
    const page = Number(q?.page ?? 1) || 1
    const perPage = Number(q?.per_page ?? 24) || 24
    return listPublicCompanies(opts.db, page, perPage)
  })

  app.get('/v1/companies/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const row = await getPublicCompany(opts.db, slug)
    if (!row) return reply.code(404).send({ error: 'not_found' })
    return row
  })

  await registerAdmin(app, ctx)
  return app
}
