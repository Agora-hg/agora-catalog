import type { CompanyCard, CompanyDetail, CompanySource, CategoryRef } from './types.js'

const MOSCOW_TZ = 'Europe/Moscow'

export function todayCheckedAt(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: MOSCOW_TZ })
}

export function toDateOnly(value: Date, now = new Date()): string {
  const today = todayCheckedAt(now)
  const asDate = value.toLocaleDateString('en-CA', { timeZone: MOSCOW_TZ })
  return asDate > today ? asDate : today
}

export function formatSourceDate(value: Date): string {
  return value.toLocaleDateString('en-CA', { timeZone: MOSCOW_TZ })
}

type CardRow = {
  slug: string
  name: string
  city: string | null
  address: string | null
  description: string | null
  productsTags: string[] | null
  website: string | null
  isVerified: boolean
  lastCheckedAt?: Date | null
}

export function toCompanyCard(row: CardRow, categories: CategoryRef[], now = new Date()): CompanyCard {
  return {
    slug: row.slug,
    name: row.name,
    city: row.city,
    address: row.address,
    description: row.description,
    categories,
    products_tags: row.productsTags ?? [],
    website: row.website,
    is_verified: row.isVerified,
    checked_at: row.lastCheckedAt ? toDateOnly(row.lastCheckedAt, now) : todayCheckedAt(now),
  }
}

type DetailRow = CardRow & {
  legalName: string | null
  inn: string | null
  ogrn: string | null
  kpp: string | null
  okved: string | null
  egrulStatus: string | null
  phone: string | null
  email: string | null
  lat: number | null
  lon: number | null
  hoursRaw: string | null
}

export function toCompanyDetail(
  row: DetailRow,
  categories: CategoryRef[],
  sources: CompanySource[],
  now = new Date(),
): CompanyDetail {
  return {
    ...toCompanyCard(row, categories, now),
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
    sources,
  }
}
