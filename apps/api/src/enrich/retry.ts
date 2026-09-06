import { DailyLimitError } from './quota.ts'

export class DaDataHttpError extends Error {
  readonly name = 'DaDataHttpError'
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfter: string | null = null,
  ) {
    super(`DaData HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

export type RetryOpts = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function isRetryable(err: unknown): boolean {
  if (err instanceof DailyLimitError) return false
  if (err instanceof DaDataHttpError) return err.retryable
  if (err instanceof TypeError) return true
  return false
}

export function backoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
}

function retryAfterMs(err: unknown, fallback: number, maxDelayMs: number): number {
  if (!(err instanceof DaDataHttpError) || !err.retryAfter) return fallback
  const asNumber = Number(err.retryAfter)
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.min(asNumber * 1000, maxDelayMs)
  }
  const when = Date.parse(err.retryAfter)
  if (Number.isFinite(when)) {
    return Math.min(Math.max(0, when - Date.now()), maxDelayMs)
  }
  return fallback
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5
  const baseDelayMs = opts.baseDelayMs ?? 500
  const maxDelayMs = opts.maxDelayMs ?? 30_000
  const sleep = opts.sleep ?? defaultSleep

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === maxAttempts) throw err
      const fallback = backoffMs(attempt, baseDelayMs, maxDelayMs)
      await sleep(retryAfterMs(err, fallback, maxDelayMs))
    }
  }
  throw lastErr
}
