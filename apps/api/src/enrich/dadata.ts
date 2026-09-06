import { and, eq, isNull, ne, or } from 'drizzle-orm'
import { companies, companySources, type Db } from '@agora/db'
import {
  decideMatch,
  mapEgrulStatus,
  partyStatus,
  pickInn,
  pickKpp,
  pickLegalName,
  pickOgrn,
  pickOkved,
} from './match.ts'
import type {
  DaDataClient,
  DaDataSuggestion,
  DadataSourcePayload,
  EnrichResult,
  MatchDecision,
  MatchReason,
} from './types.ts'

export type { DaDataClient, DadataSourcePayload, EnrichResult, MatchDecision }
export { decideMatch, mapEgrulStatus, partyStatus }

const SOURCE_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party'

export function buildSourcePayload(opts: {
  query: string
  city: string | null
  suggestions: DaDataSuggestion[]
  decision: MatchDecision
  acceptedInn: string | null
}): DadataSourcePayload {
  return {
    query: opts.query,
    city: opts.city,
    needsReview: opts.decision.status === 'needs_review',
    status: opts.decision.status,
    reason: opts.decision.reason,
    acceptedInn: opts.acceptedInn,
    suggestions: opts.suggestions,
  }
}

async function innTakenByOther(db: Db, inn: string, companyId: string): Promise<boolean> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.inn, inn), ne(companies.id, companyId)))
    .limit(1)
  return Boolean(rows[0])
}

export async function hasDadataSource(db: Db, companyId: string): Promise<boolean> {
  const rows = await db
    .select({ id: companySources.id })
    .from(companySources)
    .where(and(eq(companySources.companyId, companyId), eq(companySources.sourceType, 'dadata')))
    .limit(1)
  return Boolean(rows[0])
}

/**
 * Один шаг очереди: запрос suggest/party, кэш сырого ответа в company_sources,
 * запись реквизитов только при строгом автоматче.
 */
export async function enrichCompany(
  db: Db,
  client: DaDataClient,
  company: { id: string; name: string; city: string | null },
): Promise<EnrichResult> {
  const name = company.name.trim()
  if (!name) {
    return { companyId: company.id, name: company.name, outcome: 'skipped_no_name' }
  }
  if (await hasDadataSource(db, company.id)) {
    return { companyId: company.id, name, outcome: 'skipped_cached' }
  }

  const response = await client.suggestParty({ query: name, city: company.city })
  const suggestions = response.suggestions ?? []
  let decision = decideMatch(company, suggestions)
  let acceptedInn: string | null = null
  let egrulStatus: string | null = null

  if (decision.status === 'accepted' && decision.suggestion) {
    const inn = pickInn(decision.suggestion)
    if (!inn) {
      decision = { status: 'needs_review', reason: 'no_inn', suggestion: decision.suggestion }
    } else if (await innTakenByOther(db, inn, company.id)) {
      decision = { status: 'needs_review', reason: 'inn_conflict', suggestion: decision.suggestion }
    } else {
      acceptedInn = inn
      egrulStatus = mapEgrulStatus(partyStatus(decision.suggestion))
    }
  }

  const payload = buildSourcePayload({
    query: name,
    city: company.city,
    suggestions,
    decision,
    acceptedInn,
  })
  const suggestion = decision.suggestion

  await db.transaction(async (tx) => {
    await tx.insert(companySources).values({
      companyId: company.id,
      sourceType: 'dadata',
      sourceUrl: SOURCE_URL,
      payload,
      checkedAt: new Date(),
    })

    if (decision.status === 'accepted' && suggestion && acceptedInn) {
      await tx
        .update(companies)
        .set({
          inn: acceptedInn,
          ogrn: pickOgrn(suggestion),
          kpp: pickKpp(suggestion),
          okved: pickOkved(suggestion),
          legalName: pickLegalName(suggestion),
          egrulStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companies.id, company.id),
            or(isNull(companies.inn), eq(companies.inn, '')),
          ),
        )
    }
  })

  return {
    companyId: company.id,
    name,
    outcome: decision.status,
    reason: decision.reason as MatchReason,
    inn: acceptedInn,
    egrulStatus,
  }
}
