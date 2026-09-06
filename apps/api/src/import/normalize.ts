import type { NormalizedOrg, YandexOrgRaw } from './types.ts'

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'yclid',
  'ysclid',
  'fbclid',
  'gclid',
  'from',
  '_openstat',
  'etext',
])

const YANDEX_HOST = /(^|\.)(yandex\.(ru|com|by|kz|ua)|ya\.ru)$/i

const MOSCOW_PREFIX =
  /^(?:г(?:ород)?\.?\s*)?москва(?:\s*,\s*|\s+)/i

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return `+7${digits.slice(1)}`
  }
  if (digits.length === 10) return `+7${digits}`
  if (hasPlus && digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

export function normalizeInn(value: unknown): string | null {
  if (value == null) return null
  const digits = String(value).replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 12) return digits
  return null
}

export function innFromPayload(raw: YandexOrgRaw): string | null {
  const direct = normalizeInn(raw.inn)
  if (direct) return direct
  const features = raw.features
  if (!features || typeof features !== 'object') return null
  for (const [key, value] of Object.entries(features)) {
    if (/инн/i.test(key) || key.toLowerCase() === 'inn') {
      const inn = normalizeInn(value)
      if (inn) return inn
    }
  }
  return null
}

function unwrapYandexRedirect(url: string): string {
  try {
    const parsed = new URL(url)
    if (!YANDEX_HOST.test(parsed.hostname)) return url
    const target =
      parsed.searchParams.get('to') ??
      parsed.searchParams.get('url') ??
      parsed.searchParams.get('target')
    if (!target) return url
    return unwrapYandexRedirect(target)
  } catch {
    return url
  }
}

export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null
  let raw = input.trim()
  if (!raw) return null
  raw = unwrapYandexRedirect(raw)
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (YANDEX_HOST.test(parsed.hostname)) return null
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      parsed.searchParams.delete(key)
    }
  }
  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()
  parsed.protocol = 'https:'
  let out = parsed.toString()
  if (parsed.pathname === '/' && !parsed.search) {
    out = out.replace(/\/$/, '')
  }
  return out
}

export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null
  try {
    const host = new URL(website.startsWith('http') ? website : `https://${website}`)
      .hostname.toLowerCase()
    return host.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function splitAddress(addressRaw: string | null | undefined): {
  address: string | null
  city: string | null
  region: string | null
} {
  if (!addressRaw) return { address: null, city: null, region: null }
  const original = addressRaw.trim()
  if (!original) return { address: null, city: null, region: null }

  let address = original
  let city: string | null = null
  let region: string | null = null

  if (MOSCOW_PREFIX.test(address) || /^москва\b/i.test(address)) {
    city = 'Москва'
    region = 'Москва'
    address = address.replace(MOSCOW_PREFIX, '').replace(/^москва\s*/i, '')
    address = address.replace(/^,\s*/, '')
  } else if (/московск(?:ая)?\s+обл/i.test(address)) {
    region = 'Московская область'
  }

  if (!city && /москва/i.test(original)) {
    city = 'Москва'
    region = region ?? 'Москва'
  }

  // Parser is Moscow-only; keep a city so the card is filterable.
  if (!city) {
    city = 'Москва'
    region = region ?? 'Москва'
  }

  return { address: address.trim() || original, city, region }
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null
  const email = input.trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  return email
}

const NON_PRODUCT_FEATURE =
  /^(способ оплаты|доставка|самовывоз|оплата картой|акции|доступность|парковка|лифт|инн)$/i

/** Товарные ключи features с Я.Карт. Оплату, доставку и ИНН в теги не тащим. */
export function featureTags(features: Record<string, unknown> | null | undefined): string[] {
  if (!features || typeof features !== 'object') return []
  const tags: string[] = []
  const seen = new Set<string>()
  for (const [key, value] of Object.entries(features)) {
    const k = key.trim()
    if (!k || NON_PRODUCT_FEATURE.test(k)) continue
    if (value === false || value == null || value === '') continue
    const fold = k.toLowerCase().replace(/ё/g, 'е')
    if (seen.has(fold)) continue
    seen.add(fold)
    tags.push(k)
  }
  return tags
}

export function normalizeOrg(raw: YandexOrgRaw): NormalizedOrg | { error: string } {
  const oid = raw.oid?.trim()
  if (!oid) return { error: 'missing oid' }
  const name = raw.name?.trim()
  if (!name) return { error: 'missing name' }

  const phones = (raw.phones ?? [])
    .map((p) => normalizePhone(p))
    .filter((p): p is string => Boolean(p))
  const uniquePhones = [...new Set(phones)]
  const website = normalizeWebsite(raw.website)
  const { address, city, region } = splitAddress(raw.address_raw || raw.address)

  let scrapedAt: Date | null = null
  if (raw.scraped_at) {
    const d = new Date(raw.scraped_at)
    if (!Number.isNaN(d.getTime())) scrapedAt = d
  }

  return {
    oid,
    name,
    slugHint: raw.slug?.trim() || null,
    sourceUrl: raw.url?.trim() || null,
    inn: innFromPayload(raw),
    website,
    domain: websiteDomain(website),
    email: normalizeEmail(raw.email),
    phone: uniquePhones[0] ?? null,
    phones: uniquePhones,
    address,
    city,
    region,
    lat: typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : null,
    lon: typeof raw.lon === 'number' && Number.isFinite(raw.lon) ? raw.lon : null,
    hoursRaw: raw.hours_raw?.trim() || null,
    rating: typeof raw.rating === 'number' && Number.isFinite(raw.rating) ? raw.rating : null,
    reviewsCount:
      typeof raw.reviews_count === 'number' && Number.isFinite(raw.reviews_count)
        ? Math.trunc(raw.reviews_count)
        : null,
    descriptionRaw: raw.description_raw ?? null,
    yandexCategories: (raw.categories ?? []).filter((c): c is string => Boolean(c)),
    featureTags: featureTags(raw.features ?? null),
    nameNorm: normalizeName(name),
    scrapedAt,
  }
}
