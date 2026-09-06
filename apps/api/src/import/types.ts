/** One JSONL row from the Yandex.Maps parser (TASK-005). Extra keys are ignored. */
export type YandexOrgRaw = {
  oid: string
  slug?: string | null
  url?: string | null
  name?: string | null
  categories?: string[] | null
  address?: string | null
  address_raw?: string | null
  lat?: number | null
  lon?: number | null
  phones?: Array<string | null> | null
  website?: string | null
  socials?: string[] | null
  email?: string | null
  hours_raw?: string | null
  rating?: number | null
  reviews_count?: number | null
  description_raw?: string | null
  features?: Record<string, unknown> | null
  bbox_key?: string | null
  scraped_at?: string | null
  source?: string | null
  /** Parser does not collect this; fixtures / rare card fields may. */
  inn?: string | null
}

export type NormalizedOrg = {
  oid: string
  name: string
  slugHint: string | null
  sourceUrl: string | null
  inn: string | null
  website: string | null
  domain: string | null
  email: string | null
  phone: string | null
  phones: string[]
  address: string | null
  city: string | null
  region: string | null
  lat: number | null
  lon: number | null
  hoursRaw: string | null
  rating: number | null
  reviewsCount: number | null
  descriptionRaw: string | null
  yandexCategories: string[]
  nameNorm: string
  scrapedAt: Date | null
}

export type DedupKeys = {
  yandexOid: string | null
  inn: string | null
  domain: string | null
  nameNorm: string | null
  phone: string | null
}

export type ExistingCompany = {
  id: string
  yandexOid: string | null
  inn: string | null
  domain: string | null
  nameNorm: string
  phone: string | null
  phones: string[] | null
  slug: string
}

export type ImportStats = {
  ingested: number
  created: number
  updated: number
  errors: number
  withoutCategory: number
  markedUnknown: number
  companiesTotal: number
}
