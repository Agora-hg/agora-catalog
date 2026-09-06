import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { categories, companies, companyCategories, companySources } from '@agora/db'
import type { Db } from '@agora/db'
import { cityNameForSlug } from './cities.js'
import { formatSourceDate, toCompanyCard, toCompanyDetail } from './serialize.js'
import type { CategoryNode, CategoryRef, CompanyCard, CompanyList, ListQuery } from './types.js'

export const visibleCompany = and(
  eq(companies.isDeleted, false),
  eq(companies.isActive, true),
  ne(companies.status, 'inactive'),
)

const cardColumns = {
  id: companies.id,
  slug: companies.slug,
  name: companies.name,
  city: companies.city,
  address: companies.address,
  description: companies.description,
  productsTags: companies.productsTags,
  website: companies.website,
  isVerified: companies.isVerified,
  lastCheckedAt: companies.lastCheckedAt,
}

const detailColumns = {
  ...cardColumns,
  legalName: companies.legalName,
  inn: companies.inn,
  ogrn: companies.ogrn,
  kpp: companies.kpp,
  okved: companies.okved,
  egrulStatus: companies.egrulStatus,
  phone: companies.phone,
  email: companies.email,
  lat: companies.lat,
  lon: companies.lon,
  hoursRaw: companies.hoursRaw,
}

async function categoryIdsForSlug(db: Db, slug: string): Promise<string[] | null> {
  const [cat] = await db
    .select({ id: categories.id, isActive: categories.isActive })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1)
  if (!cat || !cat.isActive) return null
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.parentId, cat.id), eq(categories.isActive, true)))
  return [cat.id, ...children.map((c) => c.id)]
}

function cityFilter(slug: string): SQL {
  const name = cityNameForSlug(slug)
  return or(sql`lower(${companies.city}) = lower(${name})`, sql`lower(${companies.city}) = lower(${slug})`) as SQL
}

async function loadCategoriesByCompany(db: Db, companyIds: string[]): Promise<Map<string, CategoryRef[]>> {
  const map = new Map<string, CategoryRef[]>()
  if (companyIds.length === 0) return map
  const rows = await db
    .select({
      companyId: companyCategories.companyId,
      slug: categories.slug,
      name: categories.name,
    })
    .from(companyCategories)
    .innerJoin(categories, eq(companyCategories.categoryId, categories.id))
    .where(and(inArray(companyCategories.companyId, companyIds), eq(categories.isActive, true)))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
  for (const row of rows) {
    const list = map.get(row.companyId) ?? []
    list.push({ slug: row.slug, name: row.name })
    map.set(row.companyId, list)
  }
  return map
}

export async function listCompanies(db: Db, query: ListQuery): Promise<CompanyList | 'category_not_found'> {
  const conditions: SQL[] = [visibleCompany as SQL]

  if (query.categorySlug) {
    const ids = await categoryIdsForSlug(db, query.categorySlug)
    if (!ids) return 'category_not_found'
    const linked = await db
      .selectDistinct({ companyId: companyCategories.companyId })
      .from(companyCategories)
      .where(inArray(companyCategories.categoryId, ids))
    if (linked.length === 0) {
      return { items: [], total: 0, page: query.page, per_page: query.perPage }
    }
    conditions.push(
      inArray(
        companies.id,
        linked.map((row) => row.companyId),
      ),
    )
  }

  if (query.city) conditions.push(cityFilter(query.city))
  if (query.verified) conditions.push(eq(companies.isVerified, true))

  const q = query.q?.trim()
  if (q) {
    conditions.push(sql`${companies.searchVector} @@ plainto_tsquery('russian', ${q})`)
  }

  const where = and(...conditions)

  const [countRow] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(companies).where(where)
  const total = Number(countRow?.total ?? 0)

  const offset = (query.page - 1) * query.perPage
  const orderBy = q
    ? [
        sql`ts_rank(${companies.searchVector}, plainto_tsquery('russian', ${q})) DESC`,
        desc(companies.isVerified),
        asc(companies.name),
      ]
    : query.sort === 'name'
      ? [asc(companies.name)]
      : [desc(companies.isVerified), asc(companies.name)]

  const rows = await db
    .select(cardColumns)
    .from(companies)
    .where(where)
    .orderBy(...orderBy)
    .limit(query.perPage)
    .offset(offset)

  const cats = await loadCategoriesByCompany(
    db,
    rows.map((row) => row.id),
  )
  const items: CompanyCard[] = rows.map((row) => toCompanyCard(row, cats.get(row.id) ?? []))

  return { items, total, page: query.page, per_page: query.perPage }
}

export async function getCompanyBySlug(db: Db, slug: string) {
  const [row] = await db
    .select(detailColumns)
    .from(companies)
    .where(and(eq(companies.slug, slug), visibleCompany))
    .limit(1)
  if (!row) return null

  const cats = await loadCategoriesByCompany(db, [row.id])
  const sourceRows = await db
    .select({
      sourceType: companySources.sourceType,
      checkedAt: companySources.checkedAt,
    })
    .from(companySources)
    .where(eq(companySources.companyId, row.id))
    .orderBy(desc(companySources.checkedAt))

  return toCompanyDetail(
    row,
    cats.get(row.id) ?? [],
    sourceRows.map((s) => ({
      source_type: s.sourceType,
      checked_at: formatSourceDate(s.checkedAt),
    })),
  )
}

export async function getCategoryTree(db: Db): Promise<CategoryNode[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name))

  const childrenByParent = new Map<string, CategoryNode[]>()
  for (const row of rows) {
    if (!row.parentId) continue
    const list = childrenByParent.get(row.parentId) ?? []
    list.push({ slug: row.slug, name: row.name, children: [] })
    childrenByParent.set(row.parentId, list)
  }

  return rows
    .filter((row) => row.parentId === null)
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      children: childrenByParent.get(row.id) ?? [],
    }))
}
