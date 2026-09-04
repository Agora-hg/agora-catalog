import { companyClaims, companies, type Db } from '@agora/db'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { AppError } from '../errors.ts'
import { asString, isUuid } from '../http.ts'
import { verifyCompany } from './companies.ts'

const CLAIM_STATUSES = ['new', 'in_review', 'applied', 'rejected'] as const
type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export async function listClaims(db: Db, opts: { status?: string; page?: number; perPage?: number }) {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 50))
  const status = opts.status
  const where =
    status && (CLAIM_STATUSES as readonly string[]).includes(status)
      ? eq(companyClaims.status, status as ClaimStatus)
      : undefined
  const [totalRow] = await db.select({ n: count() }).from(companyClaims).where(where)
  const items = await db
    .select({
      claim: companyClaims,
      companyName: companies.name,
      companySlug: companies.slug,
    })
    .from(companyClaims)
    .innerJoin(companies, eq(companies.id, companyClaims.companyId))
    .where(where)
    .orderBy(
      sql`case ${companyClaims.status} when 'new' then 0 when 'in_review' then 1 else 2 end`,
      desc(companyClaims.createdAt),
    )
    .limit(perPage)
    .offset((page - 1) * perPage)
  return { items, total: Number(totalRow?.n ?? 0), page, per_page: perPage }
}

export async function getClaim(db: Db, id: string) {
  if (!isUuid(id)) throw new AppError(404, 'Обращение не найдено')
  const [row] = await db
    .select({
      claim: companyClaims,
      companyName: companies.name,
      companySlug: companies.slug,
    })
    .from(companyClaims)
    .innerJoin(companies, eq(companies.id, companyClaims.companyId))
    .where(eq(companyClaims.id, id))
    .limit(1)
  if (!row) throw new AppError(404, 'Обращение не найдено')
  return row
}

export async function patchClaim(db: Db, id: string, body: Record<string, unknown>) {
  const current = await getClaim(db, id)
  const status = asString(body.status)
  if (!(CLAIM_STATUSES as readonly string[]).includes(status)) {
    throw new AppError(400, 'Неизвестный статус обращения')
  }
  if (status === 'applied' && current.claim.type === 'verify') {
    await verifyCompany(db, current.claim.companyId)
  }
  const [updated] = await db
    .update(companyClaims)
    .set({ status: status as ClaimStatus })
    .where(eq(companyClaims.id, id))
    .returning()
  return updated
}

export async function newClaimsCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(companyClaims)
    .where(and(eq(companyClaims.status, 'new')))
  return Number(row?.n ?? 0)
}

export function serializeClaim(
  row: typeof companyClaims.$inferSelect,
  extra?: { company_name?: string; company_slug?: string },
) {
  return {
    id: row.id,
    company_id: row.companyId,
    company_name: extra?.company_name ?? null,
    company_slug: extra?.company_slug ?? null,
    type: row.type,
    status: row.status,
    name: row.name,
    position: row.position,
    phone: row.phone,
    email: row.email,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  }
}
