import { createHmac } from 'node:crypto'

/** ip_hash, не IP: для уникальных посетителей хватает, ПД не заводим. */
export function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip.trim()).digest('hex')
}

export function clientIp(req: { ip: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  if (Array.isArray(forwarded) && typeof forwarded[0] === 'string') {
    return forwarded[0].split(',')[0].trim()
  }
  return req.ip || '0.0.0.0'
}
