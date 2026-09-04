import { adminUsers, type Db } from '@agora/db'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { COOKIE_NAME, decodeSession, encodeSession, sessionExpiry, verifyPassword } from '../auth.js'
import { AppError } from '../errors.js'
import { asString, redirect, wantsHtml } from '../http.js'

export type AdminUser = typeof adminUsers.$inferSelect

export type AppContext = {
  db: Db
  sessionSecret: string
  cookieSecure: boolean
  ipHashSalt: string
}

export async function loadAdmin(req: FastifyRequest, ctx: AppContext): Promise<AdminUser | null> {
  const token = req.cookies[COOKIE_NAME]
  if (!token) return null
  const session = decodeSession(token, ctx.sessionSecret)
  if (!session) return null
  const [user] = await ctx.db.select().from(adminUsers).where(eq(adminUsers.id, session.uid)).limit(1)
  if (!user || !user.isActive) return null
  return user
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  ctx: AppContext,
): Promise<AdminUser | null> {
  const user = await loadAdmin(req, ctx)
  if (user) return user
  const accept = String(req.headers.accept ?? '')
  if (wantsHtml(req) || accept.includes('text/html')) {
    redirect(reply, '/admin/login', 302)
    return null
  }
  reply.code(401).send({ error: 'unauthorized' })
  return null
}

export function setSessionCookie(reply: FastifyReply, userId: string, ctx: AppContext) {
  const token = encodeSession({ uid: userId, exp: sessionExpiry() }, ctx.sessionSecret)
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.cookieSecure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext) {
  reply.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.cookieSecure })
}

export async function loginWithPassword(ctx: AppContext, email: string, password: string): Promise<AdminUser> {
  const normalized = email.trim().toLowerCase()
  const [user] = await ctx.db.select().from(adminUsers).where(eq(adminUsers.email, normalized)).limit(1)
  if (!user || !user.isActive) throw new AppError(401, 'Неверный email или пароль')
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw new AppError(401, 'Неверный email или пароль')
  return user
}

export function readLoginBody(body: unknown): { email: string; password: string } {
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return { email: asString(rec.email), password: asString(rec.password) }
}
