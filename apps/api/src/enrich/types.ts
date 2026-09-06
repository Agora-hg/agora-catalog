export type DaDataPartyName = {
  full_with_opf?: string | null
  short_with_opf?: string | null
  full?: string | null
  short?: string | null
}

export type DaDataPartyState = {
  status?: string | null
  code?: string | null
  actuality_date?: number | null
  registration_date?: number | null
  liquidation_date?: number | null
}

export type DaDataPartyAddressData = {
  city?: string | null
  city_with_type?: string | null
  settlement?: string | null
  settlement_with_type?: string | null
  region?: string | null
  region_with_type?: string | null
  kladr_id?: string | null
  city_kladr_id?: string | null
  region_kladr_id?: string | null
}

export type DaDataPartyAddress = {
  value?: string | null
  unrestricted_value?: string | null
  data?: DaDataPartyAddressData | null
}

export type DaDataPartyData = {
  inn?: string | null
  ogrn?: string | null
  kpp?: string | null
  okved?: string | null
  branch_type?: string | null
  type?: string | null
  name?: DaDataPartyName | null
  state?: DaDataPartyState | null
  address?: DaDataPartyAddress | string | null
}

export type DaDataSuggestion = {
  value: string
  unrestricted_value?: string | null
  data?: DaDataPartyData | null
}

export type SuggestPartyResponse = {
  suggestions: DaDataSuggestion[]
}

export type SuggestPartyRequest = {
  query: string
  city?: string | null
}

export interface DaDataClient {
  suggestParty(req: SuggestPartyRequest): Promise<SuggestPartyResponse>
}

export type MatchStatus = 'accepted' | 'needs_review' | 'not_found'

export type MatchReason =
  | 'exact_active'
  | 'exact_liquidated'
  | 'no_exact_name_city'
  | 'ambiguous'
  | 'no_inn'
  | 'empty'
  | 'inn_conflict'
  | 'branch_only'

export type MatchDecision = {
  status: MatchStatus
  reason: MatchReason
  suggestion: DaDataSuggestion | null
}

/** Payload in company_sources — TASK-009 читает needsReview + suggestions. */
export type DadataSourcePayload = {
  query: string
  city: string | null
  needsReview: boolean
  status: MatchStatus
  reason: MatchReason
  acceptedInn: string | null
  suggestions: DaDataSuggestion[]
}

export type EnrichOutcome = MatchStatus | 'skipped_cached' | 'skipped_no_name'

export type EnrichResult = {
  companyId: string
  name: string
  outcome: EnrichOutcome
  reason?: MatchReason
  inn?: string | null
  egrulStatus?: string | null
}

export type EnrichStats = {
  queued: number
  matched: number
  needsReview: number
  notFound: number
  skippedCached: number
  skippedNoName: number
  apiCalls: number
  quotaUsed: number
  quotaRemaining: number
  quotaLimit: number
  stopped: 'daily_limit' | null
}

export const DAILY_LIMIT = 10_000
export const DADATA_PARTY_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party'
