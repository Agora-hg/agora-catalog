import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { Db } from './db.js'
import { registerCatalogRoutes } from './routes/catalog.js'

export async function buildApp(db: Db) {
  const app = Fastify({ logger: false })
  await app.register(cors, { origin: true })
  await app.register(
    async (scoped) => {
      registerCatalogRoutes(scoped, db)
    },
    { prefix: '/v1' },
  )
  return app
}

export { invalidateCatalogCache } from './cache.js'
