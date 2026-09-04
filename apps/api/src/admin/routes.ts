import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AppError, isAppError } from '../errors.ts'
import { asString, bodyOf, queryOf, redirect, wantsHtml, wantsJson } from '../http.ts'
import { getFunnel } from './funnel.ts'
import { funnelPage, loginPage, requestPage, requestsPage } from './html.ts'
import {
  attachCompanies,
  getAdminRequest,
  listAdminRequests,
  newRequestsCount,
  patchRequest,
  patchRequestCompany,
  searchCompanies,
  serializeRequest,
  serializeRequestCompany,
} from './requests.ts'
import {
  clearSessionCookie,
  loginWithPassword,
  readLoginBody,
  requireAdmin,
  setSessionCookie,
  type AppContext,
} from './session.ts'

function sendError(req: FastifyRequest, reply: FastifyReply, err: unknown) {
  const status = isAppError(err) ? err.statusCode : 500
  const message = isAppError(err) ? err.message : 'Внутренняя ошибка'
  if (wantsHtml(req) || String(req.headers.accept ?? '').includes('text/html')) {
    const back = String(req.headers.referer ?? '/admin/requests')
    try {
      const url = new URL(back)
      url.searchParams.set('error', message)
      return redirect(reply, url.pathname + url.search)
    } catch {
      return redirect(reply, `/admin/requests?error=${encodeURIComponent(message)}`)
    }
  }
  return reply.code(status).send({ error: message })
}

export async function registerAdmin(app: FastifyInstance, ctx: AppContext) {
  app.get('/admin/login', async (req, reply) => {
    return reply.type('text/html').send(loginPage(asString(queryOf(req).error) || undefined))
  })

  app.post('/admin/auth/login', async (req, reply) => {
    try {
      const { email, password } = readLoginBody(req.body)
      if (!email || !password) throw new AppError(400, 'Введите email и пароль')
      const user = await loginWithPassword(ctx, email, password)
      setSessionCookie(reply, user.id, ctx)
      if (wantsHtml(req)) return redirect(reply, '/admin/requests')
      return { ok: true }
    } catch (err) {
      if (wantsHtml(req) && isAppError(err)) {
        return reply.code(401).type('text/html').send(loginPage(err.message))
      }
      return sendError(req, reply, err)
    }
  })

  app.post('/admin/auth/logout', async (req, reply) => {
    clearSessionCookie(reply, ctx)
    if (wantsHtml(req) || String(req.headers.accept ?? '').includes('text/html')) {
      return redirect(reply, '/admin/login')
    }
    return { ok: true }
  })

  app.get('/admin', async (_req, reply) => redirect(reply, '/admin/requests', 302))

  app.get('/admin/requests', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const q = queryOf(req)
    const status = asString(q.status)
    const result = await listAdminRequests(ctx.db, {
      status: status || undefined,
      page: Number(asString(q.page) || '1') || 1,
    })
    if (wantsJson(req)) {
      return {
        items: result.items.map(serializeRequest),
        total: result.total,
        page: result.page,
        per_page: result.per_page,
      }
    }
    const counts = { requests: await newRequestsCount(ctx.db) }
    return reply.type('text/html').send(
      requestsPage({
        user,
        counts,
        items: result.items,
        status,
        total: result.total,
        page: result.page,
        perPage: result.per_page,
        notice: asString(q.notice) || undefined,
        error: asString(q.error) || undefined,
      }),
    )
  })

  app.get('/admin/requests/:id', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const q = queryOf(req)
      const detail = await getAdminRequest(ctx.db, id)
      if (wantsJson(req)) {
        return {
          ...serializeRequest(detail.request),
          companies: detail.companies.map((row) =>
            serializeRequestCompany(row.rc, {
              name: row.companyName,
              slug: row.companySlug,
              phone: row.companyPhone,
            }),
          ),
          responses: detail.responses.map((s) => ({
            id: s.id,
            company_id: s.companyId,
            company_name: s.companyName,
            name: s.name,
            phone: s.phone,
            email: s.email,
            message: s.message,
            status: s.status,
            created_at: s.createdAt.toISOString(),
          })),
        }
      }
      const searchQ = asString(q.q)
      const search = searchQ ? await searchCompanies(ctx.db, searchQ) : []
      const counts = { requests: await newRequestsCount(ctx.db) }
      return reply.type('text/html').send(
        requestPage({
          user,
          counts,
          request: detail.request,
          attached: detail.companies,
          responses: detail.responses,
          search,
          q: searchQ,
          notice: asString(q.notice) || undefined,
          error: asString(q.error) || undefined,
        }),
      )
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  const saveRequest = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await patchRequest(ctx.db, id, bodyOf(req))
      if (wantsHtml(req)) {
        return redirect(reply, `/admin/requests/${id}?notice=${encodeURIComponent('Сохранено')}`)
      }
      return serializeRequest(updated)
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.patch('/admin/requests/:id', saveRequest)
  app.post('/admin/requests/:id', saveRequest)

  const addCompanies = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const result = await attachCompanies(ctx.db, id, bodyOf(req))
      if (wantsHtml(req)) {
        return redirect(reply, `/admin/requests/${id}?notice=${encodeURIComponent('Добавлено: ' + result.added)}`)
      }
      return result
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.post('/admin/requests/:id/companies', addCompanies)

  const saveRc = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await patchRequestCompany(ctx.db, id, bodyOf(req))
      if (wantsHtml(req)) {
        return redirect(
          reply,
          `/admin/requests/${updated.requestId}?notice=${encodeURIComponent('Контакт обновлён')}`,
        )
      }
      return serializeRequestCompany(updated)
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.patch('/admin/request-companies/:id', saveRc)
  app.post('/admin/request-companies/:id', saveRc)

  app.get('/admin/stats/funnel', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const funnel = await getFunnel(ctx.db)
    if (wantsJson(req) || !String(req.headers.accept ?? '').includes('text/html')) {
      return funnel
    }
    const counts = { requests: await newRequestsCount(ctx.db) }
    return reply.type('text/html').send(funnelPage({ user, counts, funnel }))
  })
}
