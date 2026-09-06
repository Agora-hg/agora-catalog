import { and, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm'
import {
  companies,
  companyCategories,
  companySources,
  categories,
  seedCategories,
  type Db,
} from '@agora/db'
import { CompanyIndex } from './dedup.ts'
import { loadBatch, markRawProcessed } from './ingest.ts'
import { matchCategorySlugs } from './map-categories.ts'
import { normalizeName, normalizeOrg, websiteDomain } from './normalize.ts'
import { slugify } from './slug.ts'
import type { ExistingCompany, ImportStats, NormalizedOrg, YandexOrgRaw } from './types.ts'

function asRaw(payload: unknown): YandexOrgRaw {
  if (!payload || typeof payload !== 'object') return { oid: '' }
  return payload as YandexOrgRaw
}

async function loadIndex(db: Db): Promise<CompanyIndex> {
  const rows = await db
    .select({
      id: companies.id,
      yandexOid: companies.yandexOid,
      inn: companies.inn,
      website: companies.website,
      name: companies.name,
      phone: companies.phone,
      phones: companies.phones,
      slug: companies.slug,
    })
    .from(companies)
  const index = new CompanyIndex()
  for (const row of rows) {
    index.add({
      id: row.id,
      yandexOid: row.yandexOid,
      inn: row.inn,
      domain: websiteDomain(row.website),
      nameNorm: normalizeName(row.name),
      phone: row.phone,
      phones: row.phones,
      slug: row.slug,
    })
  }
  return index
}

async function uniqueSlug(db: Db, base: string, taken: Set<string>): Promise<string> {
  let slug = base
  let n = 2
  while (taken.has(slug)) {
    slug = `${base}-${n++}`
  }
  const clash = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)
  if (clash[0]) {
    taken.add(slug)
    return uniqueSlug(db, base, taken)
  }
  taken.add(slug)
  return slug
}

async function attachCategories(
  db: Db,
  companyId: string,
  org: NormalizedOrg,
  slugToId: Map<string, string>,
): Promise<boolean> {
  const slugs = matchCategorySlugs([
    ...org.yandexCategories,
    org.name,
    org.descriptionRaw,
  ])
  if (!slugs.length) return false
  const values = slugs
    .map((slug) => slugToId.get(slug))
    .filter((id): id is string => Boolean(id))
    .map((categoryId) => ({
      companyId,
      categoryId,
      isAuto: true,
    }))
  if (!values.length) return false
  await db
    .insert(companyCategories)
    .values(values)
    .onConflictDoNothing({
      target: [companyCategories.companyId, companyCategories.categoryId],
    })
  return true
}

async function loadCategoryMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories)
  return new Map(rows.map((r) => [r.slug, r.id]))
}

function incomingKeys(org: NormalizedOrg) {
  return {
    yandexOid: org.oid,
    inn: org.inn,
    domain: org.domain,
    nameNorm: org.nameNorm,
    phone: org.phone,
  }
}

async function insertCompany(
  db: Db,
  org: NormalizedOrg,
  slug: string,
): Promise<string> {
  const [row] = await db
    .insert(companies)
    .values({
      name: org.name,
      slug,
      inn: org.inn,
      region: org.region,
      city: org.city,
      address: org.address,
      lat: org.lat,
      lon: org.lon,
      website: org.website,
      email: org.email,
      phone: org.phone,
      phones: org.phones.length ? org.phones : null,
      // description stays null — generated later by the lead
      descriptionRaw: org.descriptionRaw,
      status: 'active',
      sourceUrl: org.sourceUrl,
      yandexOid: org.oid,
      yandexRating: org.rating,
      yandexReviewsCount: org.reviewsCount,
      hoursRaw: org.hoursRaw,
      lastCheckedAt: new Date(),
    })
    .returning({ id: companies.id })
  if (!row) throw new Error(`insert failed for oid ${org.oid}`)
  return row.id
}

async function updateCompany(db: Db, existing: ExistingCompany, org: NormalizedOrg): Promise<void> {
  const inn = existing.inn ?? org.inn
  const yandexOid = existing.yandexOid ?? org.oid
  await db
    .update(companies)
    .set({
      name: org.name,
      inn,
      region: org.region,
      city: org.city,
      address: org.address,
      lat: org.lat,
      lon: org.lon,
      website: org.website ?? undefined,
      email: org.email ?? undefined,
      phone: org.phone ?? undefined,
      phones: org.phones.length ? org.phones : undefined,
      descriptionRaw: org.descriptionRaw,
      status: 'active',
      sourceUrl: org.sourceUrl ?? undefined,
      yandexOid,
      yandexRating: org.rating,
      yandexReviewsCount: org.reviewsCount,
      hoursRaw: org.hoursRaw,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, existing.id))
}

async function addSource(
  db: Db,
  companyId: string,
  org: NormalizedOrg,
  payload: YandexOrgRaw,
): Promise<void> {
  await db.insert(companySources).values({
    companyId,
    sourceType: 'yandex_maps',
    sourceUrl: org.sourceUrl,
    payload,
    checkedAt: new Date(),
  })
}

/**
 * Companies present in Yandex before but missing from this run go active → unknown.
 * inactive is left alone (operator-verified dead). Never DELETE.
 */
async function markMissingUnknown(db: Db, seenIds: string[]): Promise<number> {
  if (!seenIds.length) return 0
  const result = await db
    .update(companies)
    .set({ status: 'unknown', updatedAt: new Date() })
    .where(
      and(
        eq(companies.status, 'active'),
        isNotNull(companies.yandexOid),
        eq(companies.isDeleted, false),
        notInArray(companies.id, seenIds),
      ),
    )
    .returning({ id: companies.id })
  return result.length
}

export async function processBatch(db: Db, batch: string): Promise<Omit<ImportStats, 'ingested'>> {
  await seedCategories(db)
  const slugToId = await loadCategoryMap(db)
  const index = await loadIndex(db)
  const takenSlugs = new Set(index.values().map((c) => c.slug))
  const rows = await loadBatch(db, batch)

  let created = 0
  let updated = 0
  let errors = 0
  const seen = new Set<string>()

  for (const row of rows) {
    const raw = asRaw(row.payload)
    const org = normalizeOrg(raw)
    if ('error' in org) {
      errors++
      await markRawProcessed(db, row.id, null, org.error)
      continue
    }

    try {
      const match = index.lookup(incomingKeys(org))
      let companyId: string
      if (match) {
        await updateCompany(db, match, org)
        companyId = match.id
        updated++
        index.add({
          ...match,
          yandexOid: match.yandexOid ?? org.oid,
          inn: match.inn ?? org.inn,
          domain: org.domain ?? match.domain,
          nameNorm: org.nameNorm,
          phone: org.phone ?? match.phone,
          phones: org.phones.length ? org.phones : match.phones,
        })
      } else {
        const slug = await uniqueSlug(db, slugify(org.name, org.slugHint ?? org.oid), takenSlugs)
        companyId = await insertCompany(db, org, slug)
        created++
        index.add({
          id: companyId,
          yandexOid: org.oid,
          inn: org.inn,
          domain: org.domain,
          nameNorm: org.nameNorm,
          phone: org.phone,
          phones: org.phones,
          slug,
        })
      }

      await addSource(db, companyId, org, raw)
      await attachCategories(db, companyId, org, slugToId)
      seen.add(companyId)
      await markRawProcessed(db, row.id, companyId, null)
    } catch (err) {
      errors++
      const message = err instanceof Error ? err.message : String(err)
      await markRawProcessed(db, row.id, null, message)
    }
  }

  const markedUnknown = await markMissingUnknown(db, [...seen])

  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(companies)
  const withoutCategory =
    seen.size === 0
      ? 0
      : (
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(companies)
            .where(
              and(
                inArray(companies.id, [...seen]),
                sql`not exists (select 1 from company_categories cc where cc.company_id = ${companies.id})`,
              ),
            )
        )[0]?.n ?? 0

  return {
    created,
    updated,
    errors,
    withoutCategory,
    markedUnknown,
    companiesTotal: total?.n ?? 0,
  }
}
