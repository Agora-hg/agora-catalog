import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { isAppError } from '../errors.js'
import { asString, redirect, wantsHtml } from '../http.js'
import { loadAnalyticsReport, reportRange } from '../events/report.js'
import { analyticsPage, loginPage } from './analytics-html.js'
import {
  clearSessionCookie,
  loginWithPassword,
  readLoginBody,
  requireAdmin,
  setSessionCookie,
  type AppContext,
} from './session.js'

function queryOf(req: FastifyRequest): Record<string, unknown> {
  return req.query && typeof req.query === 'object' ? (req.query as Record<string, unknown>) : {}
}

export function registerAnalyticsAdmin(app: FastifyInstance, ctx: AppContext) {
  app.get('/admin/login', async (req, reply) => {
    return reply.type('text/html').send(loginPage(asString(queryOf(req).error) || undefined))
  })

  app.post('/admin/auth/login', async (req, reply) => {
    try {
      const { email, password } = readLoginBody(req.body)
      if (!email || !password) {
        if (wantsHtml(req)) return reply.code(401).type('text/html').send(loginPage('Введите email и пароль'))
        return reply.code(400).send({ error: 'Введите email и пароль' })
      }
      const user = await loginWithPassword(ctx, email, password)
      setSessionCookie(reply, user.id, ctx)
      if (wantsHtml(req)) return redirect(reply, '/admin/analytics')
      return { ok: true }
    } catch (err) {
      if (wantsHtml(req) && isAppError(err)) {
        return reply.code(401).type('text/html').send(loginPage(err.message))
      }
      if (isAppError(err)) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  app.post('/admin/auth/logout', async (req, reply) => {
    clearSessionCookie(reply, ctx)
    if (wantsHtml(req) || String(req.headers.accept ?? '').includes('text/html')) {
      return redirect(reply, '/admin/login')
    }
    return { ok: true }
  })

  const sendReport = async (req: FastifyRequest, reply: FastifyReply, asHtml: boolean) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const range = reportRange(queryOf(req).days)
    const report = await loadAnalyticsReport(ctx.db, range)
    if (asHtml) return reply.type('text/html').send(analyticsPage({ user, report }))
    return report
  }

  app.get('/admin/analytics', async (req, reply) => sendReport(req, reply, true))
  app.get('/admin/stats/behavior', async (req, reply) => sendReport(req, reply, false))
}
