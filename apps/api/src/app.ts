import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import type { Db } from '@agora/db'
import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { registerAdmin } from './admin/routes.ts'
import type { AppContext } from './admin/session.ts'
import { assertMinFillTime, assertRateLimit, honeypotFilled, RateLimiter } from './antispam.ts'
import { isAppError } from './errors.ts'
import { bodyOf, clientIp, wantsHtml } from './http.ts'
import { thanksPage } from './admin/html.ts'
import type { MailQueue } from './mail/queue.ts'
import { createClaim, createRequest, createSupplierResponse, listPublicRequests } from './public/requests.ts'

export type BuildAppOpts = {
  db: Db
  sessionSecret: string
  cookieSecure?: boolean
  logger?: boolean
  mailQueue: MailQueue
  operatorEmail: string
  formMinFillMs?: number
  rateLimiter?: RateLimiter
}

const PUBLIC_REQUEST_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: ['string', 'null'] },
    description: { type: 'string' },
    delivery_city: { type: ['string', 'null'] },
    quantity: { type: ['string', 'null'] },
    deadline: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
  required: ['id', 'title', 'description', 'delivery_city', 'quantity', 'deadline', 'created_at'],
} as const

export async function buildApp(opts: BuildAppOpts) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true })
  await app.register(cookie)
  await app.register(formbody)
  await app.register(cors, { origin: true })

  const ctx: AppContext = {
    db: opts.db,
    sessionSecret: opts.sessionSecret,
    cookieSecure: opts.cookieSecure ?? false,
  }
  const limiter = opts.rateLimiter ?? new RateLimiter(10 * 60 * 1000, 5)
  const minFill = opts.formMinFillMs ?? 3000
  const fakeId = () => ({ id: randomUUID() })

  app.setErrorHandler((err, req, reply) => {
    const status = isAppError(err) ? err.statusCode : 500
    const message = isAppError(err) ? err.message : 'Внутренняя ошибка'
    if (wantsHtml(req) && status < 500) {
      return reply.code(status).type('text/html').send(thanksPage('Не получилось', message))
    }
    return reply.code(status).send({ error: message })
  })

  app.get('/health', async () => ({ ok: true }))

  function guardPublic(req: Parameters<typeof clientIp>[0], kind: string) {
    const body = bodyOf(req)
    assertRateLimit(limiter, `${kind}:${clientIp(req)}`)
    if (honeypotFilled(body)) return 'honeypot' as const
    assertMinFillTime(body, minFill)
    return 'ok' as const
  }

  app.post('/v1/requests', async (req, reply) => {
    const guard = guardPublic(req, 'request')
    if (guard === 'honeypot') {
      if (wantsHtml(req)) {
        return reply.type('text/html').send(thanksPage('Заявка отправлена', 'Оператор свяжется с вами.'))
      }
      return fakeId()
    }
    const created = await createRequest(opts.db, bodyOf(req), {
      queue: opts.mailQueue,
      operatorEmail: opts.operatorEmail,
    })
    if (wantsHtml(req)) {
      return reply.type('text/html').send(thanksPage('Заявка отправлена', 'Оператор свяжется с вами.'))
    }
    return created
  })

  app.get(
    '/v1/requests/public',
    {
      schema: {
        response: {
          200: {
            type: 'array',
            items: PUBLIC_REQUEST_ITEM,
          },
        },
      },
    },
    async () => listPublicRequests(opts.db),
  )

  app.post('/v1/requests/:id/responses', async (req, reply) => {
    const guard = guardPublic(req, 'response')
    if (guard === 'honeypot') {
      if (wantsHtml(req)) {
        return reply.type('text/html').send(thanksPage('Отклик отправлен', 'Оператор свяжется с вами.'))
      }
      return fakeId()
    }
    const { id } = req.params as { id: string }
    const created = await createSupplierResponse(opts.db, id, bodyOf(req))
    if (wantsHtml(req)) {
      return reply.type('text/html').send(thanksPage('Отклик отправлен', 'Оператор свяжется с вами.'))
    }
    return created
  })

  app.post('/v1/companies/:slug/claims', async (req, reply) => {
    const guard = guardPublic(req, 'claim')
    if (guard === 'honeypot') {
      if (wantsHtml(req)) {
        return reply.type('text/html').send(thanksPage('Обращение отправлено', 'Проверим вручную.'))
      }
      return fakeId()
    }
    const { slug } = req.params as { slug: string }
    const created = await createClaim(opts.db, slug, bodyOf(req))
    if (wantsHtml(req)) {
      return reply.type('text/html').send(thanksPage('Обращение отправлено', 'Проверим вручную.'))
    }
    return created
  })

  await registerAdmin(app, ctx)
  return app
}
