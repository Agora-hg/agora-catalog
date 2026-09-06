import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { catalogCacheGet, catalogCacheSet, CATALOG_CACHE_CONTROL, catalogCacheKey } from '../cache.js'
import type { Db } from '@agora/db'
import { getCategoryTree, getCompanyBySlug, listCompanies } from '../catalog/query.js'
import type { ListQuery } from '../catalog/types.js'

type Cached = { status: number; body: unknown }

async function sendCached(req: FastifyRequest, reply: FastifyReply, produce: () => Promise<Cached>) {
  const key = catalogCacheKey(req.url)
  const hit = catalogCacheGet(key)
  if (hit) {
    reply.header('cache-control', CATALOG_CACHE_CONTROL)
    reply.header('x-cache', 'HIT')
    reply.status(hit.statusCode)
    reply.type('application/json; charset=utf-8')
    return reply.send(hit.body)
  }

  const result = await produce()
  const payload = JSON.stringify(result.body)
  if (result.status === 200 || result.status === 404) {
    catalogCacheSet(key, payload, result.status)
  }
  reply.header('cache-control', CATALOG_CACHE_CONTROL)
  reply.header('x-cache', 'MISS')
  reply.status(result.status)
  reply.type('application/json; charset=utf-8')
  return reply.send(payload)
}

function parsePage(raw: unknown): number {
  const n = Number(raw ?? 1)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function parsePerPage(raw: unknown): number {
  const n = Number(raw ?? 24)
  if (!Number.isFinite(n) || n < 1) return 24
  return Math.min(100, Math.floor(n))
}

function parseSort(raw: unknown): 'recommended' | 'name' {
  return raw === 'name' ? 'name' : 'recommended'
}

function parseVerified(raw: unknown): boolean {
  return raw === '1' || raw === 'true'
}

function listParams(query: Record<string, unknown>, extra: Partial<ListQuery> = {}): ListQuery {
  const q = typeof query.q === 'string' ? query.q : extra.q
  return {
    categorySlug: extra.categorySlug ?? (typeof query.category === 'string' ? query.category : undefined),
    city: extra.city ?? (typeof query.city === 'string' ? query.city : undefined),
    verified: parseVerified(query.verified) ? true : extra.verified,
    q: q?.trim() ? q : undefined,
    page: parsePage(query.page),
    perPage: parsePerPage(query.per_page),
    sort: parseSort(query.sort),
  }
}

export function registerCatalogRoutes(app: FastifyInstance, db: Db): void {
  app.get('/companies', async (req, reply) => {
    return sendCached(req, reply, async () => {
      const result = await listCompanies(db, listParams(req.query as Record<string, unknown>))
      if (result === 'category_not_found') {
        return { status: 200, body: { items: [], total: 0, page: parsePage((req.query as { page?: string }).page), per_page: parsePerPage((req.query as { per_page?: string }).per_page) } }
      }
      return { status: 200, body: result }
    })
  })

  app.get('/companies/:slug', async (req, reply) => {
    return sendCached(req, reply, async () => {
      const { slug } = req.params as { slug: string }
      const company = await getCompanyBySlug(db, slug)
      if (!company) return { status: 404, body: { error: 'not_found' } }
      return { status: 200, body: company }
    })
  })

  app.get('/categories', async (req, reply) => {
    return sendCached(req, reply, async () => {
      const tree = await getCategoryTree(db)
      return { status: 200, body: tree }
    })
  })

  app.get('/categories/:slug/companies', async (req, reply) => {
    return sendCached(req, reply, async () => {
      const { slug } = req.params as { slug: string }
      const result = await listCompanies(
        db,
        listParams(req.query as Record<string, unknown>, { categorySlug: slug }),
      )
      if (result === 'category_not_found') return { status: 404, body: { error: 'not_found' } }
      return { status: 200, body: result }
    })
  })

  app.get('/search', async (req, reply) => {
    const q = typeof (req.query as { q?: unknown }).q === 'string' ? (req.query as { q: string }).q.trim() : ''
    if (!q) {
      reply.status(400)
      return { error: 'q_required' }
    }
    return sendCached(req, reply, async () => {
      const result = await listCompanies(db, listParams(req.query as Record<string, unknown>, { q }))
      if (result === 'category_not_found') {
        return { status: 200, body: { items: [], total: 0, page: 1, per_page: 24 } }
      }
      return { status: 200, body: result }
    })
  })
}
