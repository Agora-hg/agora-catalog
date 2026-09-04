import type { FastifyReply, FastifyRequest } from 'fastify'

export function wantsHtml(req: FastifyRequest): boolean {
  const contentType = String(req.headers['content-type'] ?? '')
  if (contentType.includes('application/json')) return false
  if (contentType.includes('application/x-www-form-urlencoded')) return true
  const accept = String(req.headers.accept ?? '')
  if (accept.includes('text/html')) return true
  return false
}

export function redirect(reply: FastifyReply, url: string, status = 303): FastifyReply {
  return reply.redirect(url, status)
}

export function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value) && value.length > 0) return asString(value[0])
  return ''
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
