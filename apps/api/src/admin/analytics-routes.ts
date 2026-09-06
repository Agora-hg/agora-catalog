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



  const sendReport = async (req: FastifyRequest, reply: FastifyReply, asHtml: boolean) => {
    const user = await requireAdmin(req, reply, ctx)
    if (!user) return
    const range = reportRange(queryOf(req).days)
    const report = await loadAnalyticsReport(ctx.db, range)
    if (asHtml) return reply.type('text/html').send(analyticsPage({ user, report }))
    return report
  }

  // Авторизация здесь не объявляется: /admin/login и /admin/auth/* живут в
  // admin/routes.ts. TASK-011 писал свою копию, не видя чужих веток, и после
  // сборки Fastify падал на старте: «Method 'GET' already declared for route '/admin/login'».
  app.get('/admin/analytics', async (req, reply) => sendReport(req, reply, true))
  app.get('/admin/stats/behavior', async (req, reply) => sendReport(req, reply, false))
}
