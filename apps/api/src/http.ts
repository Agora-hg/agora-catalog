import type { FastifyReply, FastifyRequest } from 'fastify'

export function wantsHtml(req: FastifyRequest): boolean {
  const contentType = String(req.headers['content-type'] ?? '')
  if (contentType.includes('application/json')) return false
  if (contentType.includes('application/x-www-form-urlencoded')) return true
  if (contentType.includes('multipart/form-data')) return true
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

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const s = asString(value).toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function todayMoscow(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function formatMoscow(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '')
}

export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, '\\$&')}%`
}
