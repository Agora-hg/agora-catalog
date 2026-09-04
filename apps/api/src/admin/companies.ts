import {
  companies,
  companyCategories,
  categories,
  adminUsers,
  type Db,
} from '@agora/db'
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { AppError } from '../errors.ts'
import { asBool, asString, asStringArray, isUuid, likePattern } from '../http.ts'

export const ADMIN_PER_PAGE = 50

export type CompanyListFilter = {
  q?: string
  status?: string
  called?: '0' | '1'
  egrul?: 'liquidated'
  phone?: '0'
  deleted?: '0' | '1'
  page?: number
  perPage?: number
}

const EDITABLE_KEYS = [
  'name',
  'slug',
  'legalName',
  'inn',
  'ogrn',
  'kpp',
  'okved',
  'egrulStatus',
  'region',
  'city',
  'address',
  'lat',
  'lon',
  'website',
  'email',
  'phone',
  'phones',
  'description',
  'descriptionRaw',
  'productsTags',
  'isVerified',
  'callNote',
  'hoursRaw',
  'sourceUrl',
] as const

export function publicCompanyWhere() {
  return and(eq(companies.isDeleted, false), eq(companies.isActive, true), sql`${companies.status} <> 'inactive'`)
}

function listWhere(filter: CompanyListFilter): SQL | undefined {
  const parts: SQL[] = []
  if (filter.deleted === '1') parts.push(eq(companies.isDeleted, true))
  else parts.push(eq(companies.isDeleted, false))

  if (filter.called === '0') parts.push(isNull(companies.calledAt))
  if (filter.called === '1') parts.push(isNotNull(companies.calledAt))
  if (filter.phone === '0') {
    parts.push(or(isNull(companies.phone), eq(companies.phone, ''))!)
  }
  if (filter.egrul === 'liquidated') {
    parts.push(
      sql`(lower(coalesce(${companies.egrulStatus}, '')) like '%liquidat%'
        or lower(coalesce(${companies.egrulStatus}, '')) like '%ликвидир%')`,
    )
  }
  if (filter.status === 'active' || filter.status === 'unknown' || filter.status === 'inactive') {
    parts.push(eq(companies.status, filter.status))
  }
  const q = filter.q?.trim()
  if (q) {
    const pattern = likePattern(q)
    parts.push(
      or(
        ilike(companies.name, pattern),
        ilike(companies.legalName, pattern),
        ilike(companies.phone, pattern),
        ilike(companies.inn, pattern),
        ilike(companies.address, pattern),
        ilike(companies.website, pattern),
      )!,
    )
  }
  if (parts.length === 0) return undefined
  return and(...parts)
}

export async function listCompanies(db: Db, filter: CompanyListFilter) {
  const page = Math.max(1, filter.page ?? 1)
  const perPage = Math.min(100, Math.max(1, filter.perPage ?? ADMIN_PER_PAGE))
  const where = listWhere(filter)
  const [totalRow] = await db.select({ n: count() }).from(companies).where(where)
  const items = await db
    .select()
    .from(companies)
    .where(where)
    .orderBy(sql`${companies.calledAt} nulls first`, asc(companies.name))
    .limit(perPage)
    .offset((page - 1) * perPage)
  return { items, total: Number(totalRow?.n ?? 0), page, per_page: perPage }
}

export async function companyCounts(db: Db) {
  const [uncalled] = await db
    .select({ n: count() })
    .from(companies)
    .where(and(eq(companies.isDeleted, false), isNull(companies.calledAt)))
  const [noPhone] = await db
    .select({ n: count() })
    .from(companies)
    .where(and(eq(companies.isDeleted, false), or(isNull(companies.phone), eq(companies.phone, ''))))
  const [liquidated] = await db
    .select({ n: count() })
    .from(companies)
    .where(
      and(
        eq(companies.isDeleted, false),
        sql`(lower(coalesce(${companies.egrulStatus}, '')) like '%liquidat%'
          or lower(coalesce(${companies.egrulStatus}, '')) like '%ликвидир%')`,
      ),
    )
  const [deleted] = await db.select({ n: count() }).from(companies).where(eq(companies.isDeleted, true))
  const [alive] = await db.select({ n: count() }).from(companies).where(eq(companies.isDeleted, false))
  return {
    uncalled: Number(uncalled?.n ?? 0),
    noPhone: Number(noPhone?.n ?? 0),
    liquidated: Number(liquidated?.n ?? 0),
    deleted: Number(deleted?.n ?? 0),
    alive: Number(alive?.n ?? 0),
  }
}

export async function getCompany(db: Db, id: string) {
  if (!isUuid(id)) throw new AppError(404, 'Компания не найдена')
  const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1)
  if (!row) throw new AppError(404, 'Компания не найдена')
  const links = await db
    .select({
      categoryId: companyCategories.categoryId,
      isAuto: companyCategories.isAuto,
      name: categories.name,
      slug: categories.slug,
    })
    .from(companyCategories)
    .innerJoin(categories, eq(categories.id, companyCategories.categoryId))
    .where(eq(companyCategories.companyId, id))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
  return { company: row, categories: links }
}

export async function listDeleted(db: Db, page = 1) {
  const perPage = ADMIN_PER_PAGE
  const where = eq(companies.isDeleted, true)
  const [totalRow] = await db.select({ n: count() }).from(companies).where(where)
  const items = await db
    .select({
      company: companies,
      deletedByEmail: adminUsers.email,
      deletedByName: adminUsers.name,
    })
    .from(companies)
    .leftJoin(adminUsers, eq(adminUsers.id, companies.deletedBy))
    .where(where)
    .orderBy(desc(companies.deletedAt))
    .limit(perPage)
    .offset((page - 1) * perPage)
  return { items, total: Number(totalRow?.n ?? 0), page, per_page: perPage }
}

export async function softDeleteCompany(db: Db, id: string, reason: string, userId: string) {
  if (!isUuid(id)) throw new AppError(404, 'Компания не найдена')
  const trimmed = reason.trim()
  if (!trimmed) throw new AppError(400, 'Укажите причину')
  const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1)
  if (!row) throw new AppError(404, 'Компания не найдена')
  const [updated] = await db
    .update(companies)
    .set({
      isDeleted: true,
      deletedReason: trimmed,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id))
    .returning()
  return updated
}

export async function markCalled(db: Db, id: string, note: string) {
  if (!isUuid(id)) throw new AppError(404, 'Компания не найдена')
  const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1)
  if (!row) throw new AppError(404, 'Компания не найдена')
  const [updated] = await db
    .update(companies)
    .set({
      calledAt: new Date(),
      callNote: note.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id))
    .returning()
  return updated
}

export async function verifyCompany(db: Db, id: string) {
  if (!isUuid(id)) throw new AppError(404, 'Компания не найдена')
  const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1)
  if (!row) throw new AppError(404, 'Компания не найдена')
  const [updated] = await db
    .update(companies)
    .set({
      isVerified: true,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id))
    .returning()
  return updated
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const s = asString(value).trim()
  return s === '' ? null : s
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || asString(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export async function patchCompany(db: Db, id: string, body: Record<string, unknown>) {
  if (!isUuid(id)) throw new AppError(404, 'Компания не найдена')
  const [existing] = await db.select().from(companies).where(eq(companies.id, id)).limit(1)
  if (!existing) throw new AppError(404, 'Компания не найдена')

  if ('status' in body) {
    throw new AppError(400, 'Поле status меняет только парсер')
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) {
    const name = asString(body.name).trim()
    if (!name) throw new AppError(400, 'Название не может быть пустым')
    patch.name = name
  }
  if (body.slug !== undefined) {
    const slug = asString(body.slug).trim()
    if (!slug) throw new AppError(400, 'slug не может быть пустым')
    patch.slug = slug
  }
  if (body.legalName !== undefined || body.legal_name !== undefined) {
    patch.legalName = optionalText(body.legalName ?? body.legal_name)
  }
  if (body.inn !== undefined) patch.inn = optionalText(body.inn)
  if (body.ogrn !== undefined) patch.ogrn = optionalText(body.ogrn)
  if (body.kpp !== undefined) patch.kpp = optionalText(body.kpp)
  if (body.okved !== undefined) patch.okved = optionalText(body.okved)
  if (body.egrulStatus !== undefined || body.egrul_status !== undefined) {
    patch.egrulStatus = optionalText(body.egrulStatus ?? body.egrul_status)
  }
  if (body.region !== undefined) patch.region = optionalText(body.region)
  if (body.city !== undefined) patch.city = optionalText(body.city)
  if (body.address !== undefined) patch.address = optionalText(body.address)
  if (body.lat !== undefined) patch.lat = optionalNumber(body.lat)
  if (body.lon !== undefined) patch.lon = optionalNumber(body.lon)
  if (body.website !== undefined) patch.website = optionalText(body.website)
  if (body.email !== undefined) patch.email = optionalText(body.email)
  if (body.phone !== undefined) patch.phone = optionalText(body.phone)
  if (body.phones !== undefined) patch.phones = asStringArray(body.phones)
  if (body.description !== undefined) patch.description = optionalText(body.description)
  if (body.descriptionRaw !== undefined || body.description_raw !== undefined) {
    patch.descriptionRaw = optionalText(body.descriptionRaw ?? body.description_raw)
  }
  if (body.productsTags !== undefined || body.products_tags !== undefined) {
    patch.productsTags = asStringArray(body.productsTags ?? body.products_tags)
  }
  if (body.isVerified !== undefined || body.is_verified !== undefined) {
    patch.isVerified = asBool(body.isVerified ?? body.is_verified)
    if (patch.isVerified) patch.lastCheckedAt = new Date()
  }
  if (body.callNote !== undefined || body.call_note !== undefined) {
    patch.callNote = optionalText(body.callNote ?? body.call_note)
  }
  if (body.hoursRaw !== undefined || body.hours_raw !== undefined) {
    patch.hoursRaw = optionalText(body.hoursRaw ?? body.hours_raw)
  }
  if (body.sourceUrl !== undefined || body.source_url !== undefined) {
    patch.sourceUrl = optionalText(body.sourceUrl ?? body.source_url)
  }

  const forbidden = ['isDeleted', 'is_deleted', 'deletedReason', 'deleted_reason', 'deletedAt', 'deleted_at', 'deletedBy', 'deleted_by', 'calledAt', 'called_at']
  for (const key of forbidden) {
    if (key in body) throw new AppError(400, `Поле ${key} так не меняется`)
  }

  const [updated] = await db.update(companies).set(patch).where(eq(companies.id, id)).returning()

  const categoryRaw = body.categoryIds ?? body.category_ids ?? body.category_id
  if (categoryRaw !== undefined) {
    const ids = asStringArray(categoryRaw).filter(isUuid)
    await db.delete(companyCategories).where(eq(companyCategories.companyId, id))
    if (ids.length > 0) {
      await db.insert(companyCategories).values(ids.map((categoryId) => ({ companyId: id, categoryId, isAuto: false })))
    }
  }

  void EDITABLE_KEYS
  return updated
}

export function serializeAdminCompany(row: typeof companies.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    legal_name: row.legalName,
    inn: row.inn,
    ogrn: row.ogrn,
    kpp: row.kpp,
    okved: row.okved,
    egrul_status: row.egrulStatus,
    region: row.region,
    city: row.city,
    address: row.address,
    lat: row.lat,
    lon: row.lon,
    website: row.website,
    email: row.email,
    phone: row.phone,
    phones: row.phones,
    description: row.description,
    description_raw: row.descriptionRaw,
    products_tags: row.productsTags,
    status: row.status,
    is_active: row.isActive,
    is_verified: row.isVerified,
    is_deleted: row.isDeleted,
    deleted_reason: row.deletedReason,
    deleted_at: row.deletedAt?.toISOString() ?? null,
    deleted_by: row.deletedBy,
    called_at: row.calledAt?.toISOString() ?? null,
    call_note: row.callNote,
    hours_raw: row.hoursRaw,
    source_url: row.sourceUrl,
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}
