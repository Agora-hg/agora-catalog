/**
 * In-memory cache for public catalog GETs.
 * TTL 10 minutes (spec: 5–15). Admin panel (TASK-009) must call
 * invalidateCatalogCache() after editing a company.
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000
const HTTP_MAX_AGE_SEC = 5 * 60

type Entry = { body: string; statusCode: number; expiresAt: number }

const store = new Map<string, Entry>()

export const CATALOG_CACHE_CONTROL = `public, max-age=${HTTP_MAX_AGE_SEC}`

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_MS
  if (raw === undefined || raw === '') return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) ? n : DEFAULT_TTL_MS
}

export function catalogCacheKey(url: string): string {
  return url
}

export function catalogCacheGet(key: string): { body: string; statusCode: number } | null {
  const ttl = ttlMs()
  if (ttl <= 0) return null
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return null
  }
  return { body: entry.body, statusCode: entry.statusCode }
}

export function catalogCacheSet(key: string, body: string, statusCode: number): void {
  const ttl = ttlMs()
  if (ttl <= 0) return
  store.set(key, { body, statusCode, expiresAt: Date.now() + ttl })
}

export function invalidateCatalogCache(): void {
  store.clear()
}
