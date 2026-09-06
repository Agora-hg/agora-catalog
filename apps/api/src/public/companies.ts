import { companies, companyCategories, categories, type Db } from '@agora/db'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { publicCompanyWhere } from '../admin/companies.ts'
import { todayMoscow } from '../http.ts'

function checkedAt(last: Date | null): string {
  const today = todayMoscow()
  if (!last) return today
  const lastStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(last)
  return lastStr > today ? lastStr : today
}

async function categoriesFor(db: Db, companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, { slug: string; name: string }[]>()
  const rows = await db
    .select({
      companyId: companyCategories.companyId,
      slug: categories.slug,
      name: categories.name,
    })
    .from(companyCategories)
    .innerJoin(categories, eq(categories.id, companyCategories.categoryId))
    .where(inArray(companyCategories.companyId, companyIds))
  const map = new Map<string, { slug: string; name: string }[]>()
  for (const row of rows) {
    const list = map.get(row.companyId) ?? []
    list.push({ slug: row.slug, name: row.name })
    map.set(row.companyId, list)
  }
  return map
}

function toCard(
  row: typeof companies.$inferSelect,
  cats: { slug: string; name: string }[],
) {
  return {
    slug: row.slug,
    name: row.name,
    city: row.city ?? '',
    address: row.address ?? '',
    description: row.description ?? '',
    categories: cats,
    products_tags: row.productsTags ?? [],
    website: row.website ?? '',
    is_verified: row.isVerified,
    checked_at: checkedAt(row.lastCheckedAt),
  }
}

export async function listPublicCompanies(db: Db, page = 1, perPage = 24) {
  const where = publicCompanyWhere()
  const [totalRow] = await db.select({ n: count() }).from(companies).where(where)
  const items = await db
    .select()
    .from(companies)
    .where(where)
    .orderBy(asc(companies.name))
    .limit(perPage)
    .offset((Math.max(1, page) - 1) * perPage)
  const cats = await categoriesFor(
    db,
    items.map((row) => row.id),
  )
  return {
    items: items.map((row) => toCard(row, cats.get(row.id) ?? [])),
    total: Number(totalRow?.n ?? 0),
    page: Math.max(1, page),
    per_page: perPage,
  }
}

export async function getPublicCompany(db: Db, slug: string) {
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.slug, slug), publicCompanyWhere()))
    .limit(1)
  if (!row) return null
  const cats = await categoriesFor(db, [row.id])
  const card = toCard(row, cats.get(row.id) ?? [])
  return {
    ...card,
    legal_name: row.legalName,
    inn: row.inn,
    ogrn: row.ogrn,
    kpp: row.kpp,
    okved: row.okved,
    egrul_status: row.egrulStatus,
    phone: row.phone,
    email: row.email,
    lat: row.lat,
    lon: row.lon,
    hours_raw: row.hoursRaw,
    sources: [] as { source_type: string; checked_at: string }[],
  }
}
