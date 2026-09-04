import {
  companies,
  requestCompanies,
  requests,
  supplierResponses,
  type Db,
} from '@agora/db'
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { AppError } from '../errors.ts'
import { asString, asStringArray, isUuid, likePattern } from '../http.ts'

export const REQUEST_STATUSES = [
  'new',
  'processing',
  'suppliers_found',
  'sent_to_suppliers',
  'supplier_interested',
  'completed',
  'cancelled',
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const RC_STATUSES = [
  'selected',
  'contacted',
  'no_answer',
  'interested',
  'not_interested',
  'connected',
] as const
export type RcStatus = (typeof RC_STATUSES)[number]

export function serializeRequest(row: typeof requests.$inferSelect) {
  return {
    id: row.id,
    category_id: row.categoryId,
    title: row.title,
    description: row.description,
    quantity: row.quantity,
    dimensions: row.dimensions,
    material: row.material,
    branding: row.branding,
    delivery_city: row.deliveryCity,
    deadline: row.deadline,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    customer_email: row.customerEmail,
    status: row.status,
    internal_note: row.internalNote,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function serializeRequestCompany(
  row: typeof requestCompanies.$inferSelect,
  company?: { name: string; slug: string; phone: string | null },
) {
  return {
    id: row.id,
    request_id: row.requestId,
    company_id: row.companyId,
    company_name: company?.name ?? null,
    company_slug: company?.slug ?? null,
    company_phone: company?.phone ?? null,
    status: row.status,
    sent_at: row.sentAt ? row.sentAt.toISOString() : null,
    response_at: row.responseAt ? row.responseAt.toISOString() : null,
    comment: row.comment,
    created_at: row.createdAt.toISOString(),
  }
}

export async function listAdminRequests(
  db: Db,
  opts: { status?: string; page?: number; perPage?: number },
) {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 50))
  const status = opts.status
  const where =
    status && (REQUEST_STATUSES as readonly string[]).includes(status)
      ? eq(requests.status, status as RequestStatus)
      : undefined
  const [totalRow] = await db.select({ n: count() }).from(requests).where(where)
  const items = await db
    .select()
    .from(requests)
    .where(where)
    .orderBy(
      sql`case ${requests.status}
        when 'new' then 0
        when 'processing' then 1
        when 'suppliers_found' then 2
        when 'sent_to_suppliers' then 3
        when 'supplier_interested' then 4
        when 'completed' then 5
        else 6 end`,
      desc(requests.createdAt),
    )
    .limit(perPage)
    .offset((page - 1) * perPage)
  return { items, total: Number(totalRow?.n ?? 0), page, per_page: perPage }
}

export async function getAdminRequest(db: Db, id: string) {
  if (!isUuid(id)) throw new AppError(404, 'Заявка не найдена')
  const [row] = await db.select().from(requests).where(eq(requests.id, id)).limit(1)
  if (!row) throw new AppError(404, 'Заявка не найдена')
  const attached = await db
    .select({
      rc: requestCompanies,
      companyName: companies.name,
      companySlug: companies.slug,
      companyPhone: companies.phone,
    })
    .from(requestCompanies)
    .innerJoin(companies, eq(companies.id, requestCompanies.companyId))
    .where(eq(requestCompanies.requestId, id))
    .orderBy(requestCompanies.createdAt)
  const responses = await db
    .select()
    .from(supplierResponses)
    .where(eq(supplierResponses.requestId, id))
    .orderBy(desc(supplierResponses.createdAt))
  return { request: row, companies: attached, responses }
}

export async function patchRequest(db: Db, id: string, body: Record<string, unknown>) {
  const current = await getAdminRequest(db, id)
  const patch: Partial<typeof requests.$inferInsert> = { updatedAt: new Date() }
  if (body.status !== undefined) {
    const status = asString(body.status)
    if (!(REQUEST_STATUSES as readonly string[]).includes(status)) {
      throw new AppError(400, 'Неизвестный статус заявки')
    }
    patch.status = status as RequestStatus
  }
  if (body.internal_note !== undefined) patch.internalNote = asString(body.internal_note)
  if (body.title !== undefined) patch.title = asString(body.title) || null
  const [updated] = await db.update(requests).set(patch).where(eq(requests.id, current.request.id)).returning()
  return updated!
}

export async function attachCompanies(db: Db, requestId: string, body: Record<string, unknown>) {
  if (!isUuid(requestId)) throw new AppError(404, 'Заявка не найдена')
  const [reqRow] = await db.select({ id: requests.id }).from(requests).where(eq(requests.id, requestId)).limit(1)
  if (!reqRow) throw new AppError(404, 'Заявка не найдена')
  const ids = [...new Set(asStringArray(body.company_ids ?? body.company_id).filter(isUuid))]
  if (ids.length === 0) throw new AppError(400, 'Укажите компании')
  const existing = await db
    .select({ companyId: requestCompanies.companyId })
    .from(requestCompanies)
    .where(eq(requestCompanies.requestId, requestId))
  const have = new Set(existing.map((r) => r.companyId))
  const fresh = ids.filter((id) => !have.has(id))
  if (fresh.length === 0) return { added: 0 }
  const alive = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(inArray(companies.id, fresh), eq(companies.isDeleted, false)))
  if (alive.length === 0) throw new AppError(400, 'Компании не найдены')
  await db.insert(requestCompanies).values(
    alive.map((c) => ({
      requestId,
      companyId: c.id,
      status: 'selected' as const,
    })),
  )
  const [req] = await db.select({ status: requests.status }).from(requests).where(eq(requests.id, requestId))
  if (req?.status === 'new') {
    await db
      .update(requests)
      .set({ status: 'suppliers_found', updatedAt: new Date() })
      .where(eq(requests.id, requestId))
  }
  return { added: alive.length }
}

export async function patchRequestCompany(db: Db, id: string, body: Record<string, unknown>) {
  if (!isUuid(id)) throw new AppError(404, 'Контакт не найден')
  const [row] = await db.select().from(requestCompanies).where(eq(requestCompanies.id, id)).limit(1)
  if (!row) throw new AppError(404, 'Контакт не найден')
  const patch: Partial<typeof requestCompanies.$inferInsert> = {}
  if (body.status !== undefined) {
    const status = asString(body.status)
    if (!(RC_STATUSES as readonly string[]).includes(status)) {
      throw new AppError(400, 'Неизвестный статус контакта')
    }
    patch.status = status as RcStatus
    if (status === 'contacted' && !row.sentAt) patch.sentAt = new Date()
    if (
      (status === 'no_answer' ||
        status === 'interested' ||
        status === 'not_interested' ||
        status === 'connected') &&
      !row.responseAt
    ) {
      patch.responseAt = new Date()
      if (!row.sentAt) patch.sentAt = new Date()
    }
  }
  if (body.comment !== undefined) patch.comment = asString(body.comment)
  const [updated] = await db.update(requestCompanies).set(patch).where(eq(requestCompanies.id, id)).returning()
  if (updated?.status === 'interested' || updated?.status === 'connected') {
    await db
      .update(requests)
      .set({ status: 'supplier_interested', updatedAt: new Date() })
      .where(and(eq(requests.id, row.requestId), inArray(requests.status, ['new', 'processing', 'suppliers_found', 'sent_to_suppliers'])))
  } else if (updated?.status === 'contacted') {
    await db
      .update(requests)
      .set({ status: 'sent_to_suppliers', updatedAt: new Date() })
      .where(and(eq(requests.id, row.requestId), inArray(requests.status, ['new', 'processing', 'suppliers_found'])))
  }
  return updated!
}

export async function searchCompanies(db: Db, q: string, limit = 20) {
  const query = q.trim()
  if (!query) return []
  const pattern = likePattern(query)
  return db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      phone: companies.phone,
      city: companies.city,
    })
    .from(companies)
    .where(
      and(
        eq(companies.isDeleted, false),
        or(ilike(companies.name, pattern), ilike(companies.slug, pattern), ilike(companies.phone, pattern)),
      ),
    )
    .limit(limit)
}

export async function newRequestsCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(requests).where(eq(requests.status, 'new'))
  return Number(row?.n ?? 0)
}
