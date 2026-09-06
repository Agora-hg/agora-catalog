import { categories, companies, events, type Db } from '@agora/db'
import { inArray } from 'drizzle-orm'
import { AppError } from '../errors.js'
import { isUuid } from '../http.js'
import { EVENT_NAME_SET, MAX_BATCH, type EventName } from './constants.js'
import { hashIp } from './hash.js'

const ID_MAX = 128
const TEXT_MAX = 2048
const UA_MAX = 512
const STRIP_PAYLOAD_KEYS = new Set([
  'ip',
  'ip_address',
  'ipAddress',
  'email',
  'phone',
  'customer_name',
  'customer_phone',
  'customer_email',
])

export type IngestMeta = {
  ip: string
  userAgent: string
  salt: string
  now?: Date
}

type Incoming = {
  visitor_id?: unknown
  session_id?: unknown
  event?: unknown
  company_id?: unknown
  category_id?: unknown
  path?: unknown
  referrer?: unknown
  utm?: unknown
  payload?: unknown
}

type Prepared = {
  visitorId: string
  sessionId: string | null
  event: EventName
  companyId: string | null
  categoryId: string | null
  path: string | null
  referrer: string | null
  utm: Record<string, string> | null
  payload: Record<string, unknown> | null
  slug: string | null
  categorySlug: string | null
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

function asId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > ID_MAX) return null
  return trimmed
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return clip(trimmed, TEXT_MAX)
}

function asUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return isUuid(trimmed) ? trimmed : null
}

function asUtm(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string> = {}
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
    const raw = (value as Record<string, unknown>)[key] ?? (value as Record<string, unknown>)[`utm_${key}`]
    if (typeof raw === 'string' && raw.trim()) out[key] = clip(raw.trim(), 256)
  }
  return Object.keys(out).length ? out : null
}

function asPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (STRIP_PAYLOAD_KEYS.has(key)) continue
    out[key] = raw
  }
  return Object.keys(out).length ? out : null
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload) return null
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseEventBatch(body: unknown): unknown[] {
  let value: unknown = body
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      value = JSON.parse(trimmed) as unknown
    } catch {
      throw new AppError(400, 'ожидался массив событий')
    }
  }
  if (Buffer.isBuffer(value)) {
    return parseEventBatch(value.toString('utf8'))
  }
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray((value as { events?: unknown }).events)) {
    return (value as { events: unknown[] }).events
  }
  throw new AppError(400, 'ожидался массив событий')
}

function prepareOne(raw: unknown): Prepared | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Incoming
  const visitorId = asId(row.visitor_id)
  const event = typeof row.event === 'string' ? row.event : ''
  if (!visitorId || !EVENT_NAME_SET.has(event)) return null
  const payload = asPayload(row.payload)
  return {
    visitorId,
    sessionId: asId(row.session_id),
    event: event as EventName,
    companyId: asUuid(row.company_id),
    categoryId: asUuid(row.category_id),
    path: asText(row.path),
    referrer: asText(row.referrer),
    utm: asUtm(row.utm) ?? asUtm(payload?.utm),
    payload,
    slug: payloadString(payload, 'slug') ?? payloadString(payload, 'company_slug'),
    categorySlug: payloadString(payload, 'category_slug') ?? payloadString(payload, 'category'),
  }
}

export async function ingestEvents(db: Db, body: unknown, meta: IngestMeta): Promise<number> {
  const list = parseEventBatch(body)
  if (list.length > MAX_BATCH) {
    throw new AppError(400, `батч больше ${MAX_BATCH}`)
  }
  const prepared = list.map(prepareOne).filter((row): row is Prepared => row !== null)
  if (list.length > 0 && prepared.length === 0) {
    throw new AppError(400, 'нет валидных событий')
  }
  if (prepared.length === 0) return 0

  const slugs = [...new Set(prepared.map((row) => row.slug).filter((s): s is string => Boolean(s)))]
  const categorySlugs = [
    ...new Set(prepared.map((row) => row.categorySlug).filter((s): s is string => Boolean(s))),
  ]
  const companyIds = [...new Set(prepared.map((row) => row.companyId).filter((s): s is string => Boolean(s)))]
  const categoryIds = [...new Set(prepared.map((row) => row.categoryId).filter((s): s is string => Boolean(s)))]

  const [bySlug, byCatSlug, existingCompanies, existingCategories] = await Promise.all([
    slugs.length
      ? db.select({ id: companies.id, slug: companies.slug }).from(companies).where(inArray(companies.slug, slugs))
      : Promise.resolve([]),
    categorySlugs.length
      ? db
          .select({ id: categories.id, slug: categories.slug })
          .from(categories)
          .where(inArray(categories.slug, categorySlugs))
      : Promise.resolve([]),
    companyIds.length
      ? db.select({ id: companies.id }).from(companies).where(inArray(companies.id, companyIds))
      : Promise.resolve([]),
    categoryIds.length
      ? db.select({ id: categories.id }).from(categories).where(inArray(categories.id, categoryIds))
      : Promise.resolve([]),
  ])

  const slugToId = new Map(bySlug.map((row) => [row.slug, row.id]))
  const catSlugToId = new Map(byCatSlug.map((row) => [row.slug, row.id]))
  const knownCompany = new Set(existingCompanies.map((row) => row.id))
  const knownCategory = new Set(existingCategories.map((row) => row.id))

  const ipHash = hashIp(meta.ip, meta.salt)
  const userAgent = meta.userAgent ? clip(meta.userAgent, UA_MAX) : null
  const base = meta.now ?? new Date()

  const rows = prepared.map((row, index) => {
    const companyId =
      (row.companyId && knownCompany.has(row.companyId) ? row.companyId : null) ??
      (row.slug ? (slugToId.get(row.slug) ?? null) : null)
    const categoryId =
      (row.categoryId && knownCategory.has(row.categoryId) ? row.categoryId : null) ??
      (row.categorySlug ? (catSlugToId.get(row.categorySlug) ?? null) : null)
    return {
      visitorId: row.visitorId,
      sessionId: row.sessionId,
      event: row.event,
      companyId,
      categoryId,
      path: row.path,
      referrer: row.referrer,
      utm: row.utm,
      payload: row.payload,
      ipHash,
      userAgent,
      createdAt: new Date(base.getTime() + index),
    }
  })

  await db.insert(events).values(rows)
  return rows.length
}
