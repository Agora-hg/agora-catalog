import { cityForQuery, isMoscow, normalizeCity, normalizeName } from './normalize.ts'
import type { DaDataPartyAddressData, DaDataSuggestion, MatchDecision } from './types.ts'

const DEAD_STATUSES = new Set(['LIQUIDATED', 'LIQUIDATING', 'BANKRUPT'])

export function partyStatus(suggestion: DaDataSuggestion | null | undefined): string | null {
  const raw = suggestion?.data?.state?.status
  return raw ? String(raw).toUpperCase() : null
}

export function isLiquidated(status: string | null | undefined): boolean {
  return DEAD_STATUSES.has((status ?? '').toUpperCase())
}

/** ACTIVE / LIQUIDATED / REORGANIZING — как в комментарии схемы. */
export function mapEgrulStatus(status: string | null | undefined): string | null {
  if (!status) return null
  const u = status.toUpperCase()
  if (u === 'ACTIVE') return 'ACTIVE'
  if (u === 'REORGANIZING') return 'REORGANIZING'
  if (DEAD_STATUSES.has(u)) return 'LIQUIDATED'
  return u
}

function suggestionLegalNames(suggestion: DaDataSuggestion): string[] {
  const name = suggestion.data?.name
  return [suggestion.value, suggestion.unrestricted_value, name?.short_with_opf, name?.full_with_opf]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
}

/**
 * Только имена с ОПФ (value / short_with_opf / full_with_opf).
 * name.short без «ООО» специально не сравниваем: «ПакМастер» ≠ «ООО ПАКМАСТЕР».
 */
export function nameMatches(companyName: string, suggestion: DaDataSuggestion): boolean {
  const want = normalizeName(companyName)
  if (!want) return false
  return suggestionLegalNames(suggestion).some((n) => normalizeName(n) === want)
}

function addressData(suggestion: DaDataSuggestion): DaDataPartyAddressData | null {
  const addr = suggestion.data?.address
  if (!addr || typeof addr === 'string') return null
  return addr.data ?? null
}

function suggestionCityTokens(suggestion: DaDataSuggestion): string[] {
  const addr = suggestion.data?.address
  const data = addressData(suggestion)
  const raw: Array<string | null | undefined> = [
    data?.city,
    data?.city_with_type,
    data?.settlement,
    data?.settlement_with_type,
    data?.region,
    data?.region_with_type,
  ]
  if (addr && typeof addr === 'string') raw.push(addr.split(',')[0])
  else if (addr && typeof addr === 'object') {
    raw.push((addr.value ?? '').split(',')[0])
    raw.push((addr.unrestricted_value ?? '').split(',')[0])
  }
  return raw.map((v) => (v ? normalizeCity(v) : '')).filter(Boolean)
}

function suggestionKladr(suggestion: DaDataSuggestion): string {
  const data = addressData(suggestion)
  return String(data?.city_kladr_id || data?.kladr_id || data?.region_kladr_id || '')
}

export function cityMatches(companyCity: string | null | undefined, suggestion: DaDataSuggestion): boolean {
  const want = normalizeCity(cityForQuery(companyCity))
  if (!want) return false
  const tokens = suggestionCityTokens(suggestion)
  if (tokens.includes(want)) return true
  const kladr = suggestionKladr(suggestion)
  if (isMoscow(want) && kladr.startsWith('77')) return true
  return false
}

function isMainBranch(suggestion: DaDataSuggestion): boolean {
  const branch = suggestion.data?.branch_type
  return !branch || branch === 'MAIN'
}

export function pickInn(suggestion: DaDataSuggestion | null): string | null {
  const inn = suggestion?.data?.inn
  if (!inn) return null
  const digits = String(inn).replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 12) return digits
  return null
}

export function pickLegalName(suggestion: DaDataSuggestion): string {
  const name = suggestion.data?.name
  return (
    (name?.full_with_opf || name?.short_with_opf || suggestion.value || '').trim() || suggestion.value
  )
}

export function pickOgrn(suggestion: DaDataSuggestion): string | null {
  const v = suggestion.data?.ogrn
  return v ? String(v) : null
}

export function pickKpp(suggestion: DaDataSuggestion): string | null {
  const v = suggestion.data?.kpp
  return v ? String(v) : null
}

export function pickOkved(suggestion: DaDataSuggestion): string | null {
  const v = suggestion.data?.okved
  return v ? String(v) : null
}

/**
 * Автопринятие: ровно одно совпадение нормализованного имени с ОПФ
 * И город И запись не ликвидирована. Иначе не пишем в компанию.
 */
export function decideMatch(
  company: { name: string; city: string | null | undefined },
  suggestions: DaDataSuggestion[],
): MatchDecision {
  const mains = suggestions.filter(isMainBranch)
  if (mains.length === 0) {
    return {
      status: suggestions.length === 0 ? 'not_found' : 'needs_review',
      reason: suggestions.length === 0 ? 'empty' : 'branch_only',
      suggestion: null,
    }
  }

  const exact = mains.filter((s) => nameMatches(company.name, s) && cityMatches(company.city, s))
  if (exact.length === 0) {
    return { status: 'needs_review', reason: 'no_exact_name_city', suggestion: null }
  }
  if (exact.length > 1) {
    return { status: 'needs_review', reason: 'ambiguous', suggestion: null }
  }

  const one = exact[0]!
  if (!pickInn(one)) {
    return { status: 'needs_review', reason: 'no_inn', suggestion: one }
  }
  if (isLiquidated(partyStatus(one))) {
    return { status: 'needs_review', reason: 'exact_liquidated', suggestion: one }
  }
  return { status: 'accepted', reason: 'exact_active', suggestion: one }
}
