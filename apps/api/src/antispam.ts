import { AppError } from './errors.ts'
import { asString } from './http.ts'

export const HONEYPOT_FIELDS = ['fax', 'hp', 'website_url', 'company_url'] as const

export class RateLimiter {
  private buckets = new Map<string, number[]>()

  constructor(
    private windowMs: number,
    private max: number,
  ) {}

  /** true — можно продолжать, false — лимит исчерпан. */
  check(key: string, now = Date.now()): boolean {
    const cut = now - this.windowMs
    const next = (this.buckets.get(key) ?? []).filter((t) => t > cut)
    if (next.length >= this.max) {
      this.buckets.set(key, next)
      return false
    }
    next.push(now)
    this.buckets.set(key, next)
    return true
  }

  reset() {
    this.buckets.clear()
  }
}

export function honeypotFilled(body: Record<string, unknown>): boolean {
  return HONEYPOT_FIELDS.some((field) => asString(body[field]).trim() !== '')
}

export function parseFormStartedAt(raw: unknown, now = Date.now()): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw
  }
  const s = asString(raw).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n < 1e12 ? n * 1000 : n
  }
  const ms = Date.parse(s)
  if (Number.isNaN(ms)) return null
  // мусор в будущем больше чем на 5 минут — считаем подделкой
  if (ms > now + 5 * 60 * 1000) return now
  return ms
}

export function assertMinFillTime(
  body: Record<string, unknown>,
  minMs: number,
  now = Date.now(),
): void {
  const raw = body.form_started_at ?? body.formStartedAt ?? body.started_at
  const started = parseFormStartedAt(raw, now)
  if (started === null) return
  if (now - started < minMs) {
    throw new AppError(400, 'Форма отправлена слишком быстро')
  }
}

export function assertRateLimit(limiter: RateLimiter, key: string): void {
  if (!limiter.check(key)) {
    throw new AppError(429, 'Слишком много заявок. Подождите несколько минут.')
  }
}
