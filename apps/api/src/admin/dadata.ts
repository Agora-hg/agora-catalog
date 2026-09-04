import { companies, companySources, type Db } from '@agora/db'
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import { AppError } from '../errors.ts'
import { asString, isUuid } from '../http.ts'

export type DadataSuggestion = {
  value: string
  inn: string
  ogrn: string | null
  kpp: string | null
  okved: string | null
  legalName: string
  egrulStatus: string | null
  address: string | null
}

/**
 * Очередь ручного разбора TASK-007.
 * Парсер кладёт сырой ответ DaData в company_sources (source_type='dadata').
 * Если inn у компании так и не записан — матч не приняли автоматически.
 * Принимаем и «наш» payload {needsReview, suggestions}, и сырой ответ suggest/party.
 */
export function parseSuggestions(payload: unknown): DadataSuggestion[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const raw = root.suggestions
  if (!Array.isArray(raw)) return []
  const out: DadataSuggestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const data =
      rec.data && typeof rec.data === 'object' ? (rec.data as Record<string, unknown>) : rec
    const inn = String(data.inn ?? rec.inn ?? '').trim()
    if (!inn) continue
    const state = data.state && typeof data.state === 'object' ? (data.state as Record<string, unknown>) : undefined
    const name = data.name && typeof data.name === 'object' ? (data.name as Record<string, unknown>) : undefined
    const addressField = data.address ?? rec.address
    let address: string | null = null
    if (typeof addressField === 'string') address = addressField
    else if (addressField && typeof addressField === 'object') {
      const addr = addressField as Record<string, unknown>
      address = String(addr.unrestricted_value ?? addr.value ?? '') || null
    }
    const legalName = String(
      name?.full_with_opf ?? name?.short_with_opf ?? rec.legalName ?? rec.value ?? '',
    )
    out.push({
      value: String(rec.value ?? legalName),
      inn,
      ogrn: data.ogrn ? String(data.ogrn) : rec.ogrn ? String(rec.ogrn) : null,
      kpp: data.kpp ? String(data.kpp) : rec.kpp ? String(rec.kpp) : null,
      okved: data.okved ? String(data.okved) : rec.okved ? String(rec.okved) : null,
      legalName,
      egrulStatus: state?.status ? String(state.status) : rec.egrulStatus ? String(rec.egrulStatus) : null,
      address,
    })
  }
  return out
}

export function needsReview(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const root = payload as Record<string, unknown>
  if (root.needsReview === true) return true
  if (root.status === 'needs_review') return true
  if (root.acceptedInn) return false
  return parseSuggestions(payload).length > 0
}

export async function listDadataQueue(db: Db) {
  const rows = await db
    .select({
      company: companies,
      source: companySources,
    })
    .from(companies)
    .innerJoin(companySources, eq(companySources.companyId, companies.id))
    .where(
      and(
        eq(companies.isDeleted, false),
        or(isNull(companies.inn), eq(companies.inn, '')),
        eq(companySources.sourceType, 'dadata'),
      ),
    )
    .orderBy(asc(companies.name))

  const byCompany = new Map<
    string,
    { company: typeof companies.$inferSelect; sources: (typeof companySources.$inferSelect)[] }
  >()
  for (const row of rows) {
    if (!needsReview(row.source.payload)) continue
    const current = byCompany.get(row.company.id)
    if (current) current.sources.push(row.source)
    else byCompany.set(row.company.id, { company: row.company, sources: [row.source] })
  }
  return [...byCompany.values()]
}

export async function dadataQueueCount(db: Db): Promise<number> {
  const items = await listDadataQueue(db)
  return items.length
}

export async function acceptDadataCandidate(
  db: Db,
  companyId: string,
  body: Record<string, unknown>,
) {
  if (!isUuid(companyId)) throw new AppError(404, 'Компания не найдена')
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) throw new AppError(404, 'Компания не найдена')

  const inn = asString(body.inn).trim()
  if (!inn) throw new AppError(400, 'Выберите кандидата (ИНН)')

  let chosen: DadataSuggestion | null = null
  const sourceId = asString(body.sourceId || body.source_id)
  const sources = await db
    .select()
    .from(companySources)
    .where(
      and(
        eq(companySources.companyId, companyId),
        eq(companySources.sourceType, 'dadata'),
        sourceId && isUuid(sourceId) ? eq(companySources.id, sourceId) : sql`true`,
      ),
    )

  for (const source of sources) {
    const match = parseSuggestions(source.payload).find((item) => item.inn === inn)
    if (match) {
      chosen = match
      const payload =
        source.payload && typeof source.payload === 'object'
          ? { ...(source.payload as Record<string, unknown>), needsReview: false, acceptedInn: inn, status: 'accepted' }
          : { needsReview: false, acceptedInn: inn, status: 'accepted' }
      await db
        .update(companySources)
        .set({ payload, checkedAt: new Date() })
        .where(eq(companySources.id, source.id))
      break
    }
  }

  if (!chosen) {
    chosen = {
      value: asString(body.legalName || body.legal_name) || company.name,
      inn,
      ogrn: asString(body.ogrn) || null,
      kpp: asString(body.kpp) || null,
      okved: asString(body.okved) || null,
      legalName: asString(body.legalName || body.legal_name) || company.name,
      egrulStatus: asString(body.egrulStatus || body.egrul_status) || null,
      address: asString(body.address) || null,
    }
  }

  const [updated] = await db
    .update(companies)
    .set({
      inn: chosen.inn,
      ogrn: chosen.ogrn,
      kpp: chosen.kpp,
      okved: chosen.okved,
      legalName: chosen.legalName || company.legalName,
      egrulStatus: chosen.egrulStatus,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId))
    .returning()
  return updated
}
