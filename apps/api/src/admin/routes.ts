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
import { getFunnel } from './funnel.ts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AppError, isAppError } from '../errors.ts'
import { asString, redirect, wantsHtml, wantsJson } from '../http.ts'
import {
  getCompany,
  listCompanies,
  listDeleted,
  markCalled,
  patchCompany,
  serializeAdminCompany,
  softDeleteCompany,
  verifyCompany,
  type CompanyListFilter,
} from './companies.ts'
import { getClaim, listClaims, patchClaim, serializeClaim } from './claims.ts'
import {
  createCategory,
  listCategoryTree,
  moveCategory,
  patchCategory,
  serializeCategory,
} from './categories.ts'
import {
  funnelPage,
  requestPage,
  requestsPage,
  callListPage,
  categoriesPage,
  claimPage,
  claimsPage,
  companyPage,
  deletedPage,
  loginPage,
} from './html.ts'
import { getNavCounts } from './nav.ts'
import { invalidateCatalogCache } from '../cache.ts'
import {
  clearSessionCookie,
  loginWithPassword,
  readLoginBody,
  requireAdmin,
  setSessionCookie,
  type AppContext,
} from './session.ts'

function bodyOf(req: FastifyRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
}

function queryOf(req: FastifyRequest): Record<string, unknown> {
  return req.query && typeof req.query === 'object' ? (req.query as Record<string, unknown>) : {}
}

function backTo(req: FastifyRequest, extra?: Record<string, string>, fallback = '/admin'): string {
  const raw = String(req.headers.referer ?? fallback)
  try {
    const origin = new URL(raw)
    const next = new URL(origin.pathname + origin.search, 'http://local')
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) next.searchParams.set(key, value)
        else next.searchParams.delete(key)
      }
    }
    return next.pathname + next.search
  } catch {
    return fallback
  }
}

function htmlFilter(q: Record<string, unknown>): { filter: string; list: CompanyListFilter } {
  const filter = asString(q.filter) || 'uncalled'
  const page = Number(asString(q.page) || '1') || 1
  const search = asString(q.q).trim()
  const base: CompanyListFilter = { q: search || undefined, page, deleted: '0' }
  if (filter === 'liquidated') return { filter, list: { ...base, egrul: 'liquidated' } }
  if (filter === 'nophone') return { filter, list: { ...base, phone: '0' } }
  if (filter === 'all') return { filter, list: base }
  return { filter: 'uncalled', list: { ...base, called: '0' } }
}

function sendError(req: FastifyRequest, reply: FastifyReply, err: unknown) {
  const status = isAppError(err) ? err.statusCode : 500
  const message = isAppError(err) ? err.message : 'Внутренняя ошибка'
  if (wantsHtml(req) || String(req.headers.accept ?? '').includes('text/html')) {
    return redirect(reply, backTo(req, { error: message }))
  }
  return reply.code(status).send({ error: message })
}

export async function registerAdmin(app: FastifyInstance, ctx: AppContext) {

  /**
   * Сброс кэша каталога после записи в компании и категории.
   *
   * TASK-008 сделал кэш ответов на 10 минут и оставил в cache.ts прямое условие:
   * «панель обязана вызвать invalidateCatalogCache() после правки компании».
   * TASK-009 этого кода не видел и не вызвал — ветки писались параллельно.
   * Результат обнаружился только на сборке: оператор помечает компанию удалённой,
   * а публичный каталог продолжает её отдавать до десяти минут. То есть худший
   * случай — «несуществующая» фирма ещё висит на витрине.
   *
   * Вешаем хуком, а не вызовом в каждом обработчике: обработчиков мутаций уже
   * восемь, и следующий, кто добавит девятый, забудет про кэш точно так же.
   */
  app.addHook('onResponse', async (req, reply) => {
    if (reply.statusCode >= 400) return
    if (req.method === 'GET' || req.method === 'HEAD') return
    const url = req.url.split('?')[0] ?? ''
    if (url.startsWith('/admin/companies') || url.startsWith('/admin/categories')) {
      invalidateCatalogCache()
    }
  })
  app.get('/admin/login', async (req, reply) => {
    const q = queryOf(req)
    return reply.type('text/html').send(loginPage(asString(q.error) || undefined))
  })

  app.post('/admin/auth/login', async (req, reply) => {
    try {
      const { email, password } = readLoginBody(req.body)
      if (!email || !password) throw new AppError(400, 'Введите email и пароль')
      const user = await loginWithPassword(ctx, email, password)
      setSessionCookie(reply, user.id, ctx)
      if (wantsHtml(req)) return redirect(reply, '/admin')
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
    if (wantsHtml(req) || String(req.headers.accept ?? '').includes('text/html')) return redirect(reply, '/admin/login')
    return { ok: true }
  })

  app.get('/admin', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const q = queryOf(req)
    const { filter, list } = htmlFilter(q)
    const [result, counts] = await Promise.all([listCompanies(ctx.db, list), getNavCounts(ctx.db)])
    return reply.type('text/html').send(
      callListPage({
        user,
        counts,
        extraCounts: { noPhone: counts.noPhone, liquidated: counts.liquidated, alive: counts.alive },
        filter,
        q: asString(q.q),
        items: result.items,
        total: result.total,
        page: result.page,
        perPage: result.per_page,
        error: asString(q.error) || undefined,
        notice: asString(q.notice) || undefined,
      }),
    )
  })

  app.get('/admin/deleted', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const page = Number(asString(queryOf(req).page) || '1') || 1
    const [result, counts] = await Promise.all([listDeleted(ctx.db, page), getNavCounts(ctx.db)])
    return reply.type('text/html').send(deletedPage({ user, counts, items: result.items, total: result.total, page: result.page, perPage: result.per_page }))
  })

  app.get('/admin/companies', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    if (String(req.headers.accept ?? '').includes('text/html')) return redirect(reply, '/admin', 302)
    const q = queryOf(req)
    const calledRaw = asString(q.called)
    const deletedRaw = asString(q.deleted)
    const result = await listCompanies(ctx.db, {
      q: asString(q.q) || undefined,
      status: asString(q.status) || undefined,
      called: calledRaw === '0' || calledRaw === '1' ? calledRaw : undefined,
      deleted: deletedRaw === '0' || deletedRaw === '1' ? deletedRaw : undefined,
      egrul: asString(q.egrul) === 'liquidated' ? 'liquidated' : undefined,
      phone: asString(q.phone) === '0' ? '0' : undefined,
      page: Number(asString(q.page) || '1') || 1,
    })
    return {
      items: result.items.map(serializeAdminCompany),
      total: result.total,
      page: result.page,
      per_page: result.per_page,
    }
  })

  app.get('/admin/companies/:id', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const [{ company, categories: selected }, tree, counts] = await Promise.all([
        getCompany(ctx.db, id),
        listCategoryTree(ctx.db),
        getNavCounts(ctx.db),
      ])
      if (!String(req.headers.accept ?? '').includes('text/html') && !wantsHtml(req) && req.headers.accept === 'application/json') {
        return { ...serializeAdminCompany(company), categories: selected }
      }
      if (String(req.headers.accept ?? '').includes('application/json') && !String(req.headers.accept ?? '').includes('text/html')) {
        return { ...serializeAdminCompany(company), categories: selected }
      }
      const q = queryOf(req)
      return reply.type('text/html').send(
        companyPage({
          user,
          counts,
          company,
          selectedCategoryIds: selected.map((row) => row.categoryId),
          tree,
          error: asString(q.error) || undefined,
          notice: asString(q.notice) || undefined,
        }),
      )
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  const saveCompany = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await patchCompany(ctx.db, id, bodyOf(req))
      if (wantsHtml(req)) return redirect(reply, `/admin/companies/${id}?notice=${encodeURIComponent('Сохранено')}`)
      return serializeAdminCompany(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.patch('/admin/companies/:id', saveCompany)
  app.post('/admin/companies/:id', saveCompany)

  const deleteCompany = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const reason = asString(bodyOf(req).reason)
      const updated = await softDeleteCompany(ctx.db, id, reason, user.id)
      if (wantsHtml(req)) return redirect(reply, `/admin/deleted?notice=${encodeURIComponent('Компания удалена из каталога')}`)
      return serializeAdminCompany(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.post('/admin/companies/:id/delete', deleteCompany)

  app.post('/admin/companies/:id/verify', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await verifyCompany(ctx.db, id)
      if (wantsHtml(req)) return redirect(reply, backTo(req, { notice: 'Отмечена проверенной' }, `/admin/companies/${id}`))
      return serializeAdminCompany(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.post('/admin/companies/:id/call', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await markCalled(ctx.db, id, asString(bodyOf(req).note))
      if (wantsHtml(req)) return redirect(reply, backTo(req, { notice: 'Звонок отмечен' }, '/admin'))
      return serializeAdminCompany(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  })


  app.get('/admin/claims', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const q = queryOf(req)
    const status = asString(q.status)
    const result = await listClaims(ctx.db, { status: status || undefined, page: Number(asString(q.page) || '1') || 1 })
    if (String(req.headers.accept ?? '').includes('application/json') && !String(req.headers.accept ?? '').includes('text/html')) {
      return {
        items: result.items.map((row) =>
          serializeClaim(row.claim, { company_name: row.companyName, company_slug: row.companySlug }),
        ),
        total: result.total,
        page: result.page,
        per_page: result.per_page,
      }
    }
    const counts = await getNavCounts(ctx.db)
    return reply.type('text/html').send(claimsPage({ user, counts, items: result.items, status }))
  })

  app.get('/admin/claims/:id', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const row = await getClaim(ctx.db, (req.params as { id: string }).id)
      if (String(req.headers.accept ?? '').includes('application/json') && !String(req.headers.accept ?? '').includes('text/html')) {
        return serializeClaim(row.claim, { company_name: row.companyName, company_slug: row.companySlug })
      }
      const counts = await getNavCounts(ctx.db)
      return reply.type('text/html').send(
        claimPage({
          user,
          counts,
          claim: row.claim,
          companyName: row.companyName,
          notice: asString(queryOf(req).notice) || undefined,
        }),
      )
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  const saveClaim = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await patchClaim(ctx.db, id, bodyOf(req))
      if (wantsHtml(req)) return redirect(reply, `/admin/claims/${id}?notice=${encodeURIComponent('Статус обновлён')}`)
      return serializeClaim(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.patch('/admin/claims/:id', saveClaim)
  app.post('/admin/claims/:id', saveClaim)


  app.get('/admin/categories', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const tree = await listCategoryTree(ctx.db)
    if (String(req.headers.accept ?? '').includes('application/json') && !String(req.headers.accept ?? '').includes('text/html')) {
      return { items: tree.rows.map(serializeCategory) }
    }
    const counts = await getNavCounts(ctx.db)
    const q = queryOf(req)
    return reply.type('text/html').send(
      categoriesPage({
        user,
        counts,
        roots: tree.roots,
        byParent: tree.byParent,
        error: asString(q.error) || undefined,
        notice: asString(q.notice) || undefined,
      }),
    )
  })

  app.post('/admin/categories', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const created = await createCategory(ctx.db, bodyOf(req))
      if (wantsHtml(req)) return redirect(reply, '/admin/categories?notice=' + encodeURIComponent('Категория создана'))
      return serializeCategory(created!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  const saveCategory = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const updated = await patchCategory(ctx.db, id, bodyOf(req))
      if (wantsHtml(req)) return redirect(reply, '/admin/categories?notice=' + encodeURIComponent('Сохранено'))
      return serializeCategory(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  }
  app.patch('/admin/categories/:id', saveCategory)
  app.post('/admin/categories/:id', saveCategory)

  app.post('/admin/categories/:id/move', async (req, reply) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    try {
      const { id } = req.params as { id: string }
      const direction = asString(bodyOf(req).direction) === 'down' ? 'down' : 'up'
      const updated = await moveCategory(ctx.db, id, direction)
      if (wantsHtml(req)) return redirect(reply, '/admin/categories')
      return serializeCategory(updated!)
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  // --- заявки и воронка: перенесено из TASK-010 при сборке
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
    const counts = await getNavCounts(ctx.db)
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
      const counts = await getNavCounts(ctx.db)
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
    const counts = await getNavCounts(ctx.db)
    return reply.type('text/html').send(funnelPage({ user, counts, funnel }))
  })
}
