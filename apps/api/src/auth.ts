import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export const COOKIE_NAME = 'agora_admin_session'
export const SESSION_DAYS = 7

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(':')
  if (!salt || !hex) return false
  const key = (await scryptAsync(password, salt, 64)) as Buffer
  const expected = Buffer.from(hex, 'hex')
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}

export type SessionPayload = { uid: string; exp: number }

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function encodeSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function decodeSession(token: string, secret: string): SessionPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = sign(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!parsed.uid || typeof parsed.exp !== 'number') return null
    if (parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function sessionExpiry(): number {
  return Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
}
