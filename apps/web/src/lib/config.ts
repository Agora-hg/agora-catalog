export const REVALIDATE_SECONDS = 900
export const DEFAULT_PER_PAGE = 24

/** Включение индексации поисковиками. В V0 строго false до привязки постоянного домена. */
export function isPublicIndexable(): boolean {
  return process.env.PUBLIC_INDEXABLE === 'true' || process.env.PUBLIC_INDEXABLE === '1'
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, '')
}

/** Пустая строка — это тоже «не задано». `??` её не поймает. */
function env(name: string): string | undefined {
  const raw = process.env[name]
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Публичный адрес сайта. Используется в metadataBase, каноникалах и sitemap.
 *
 * Порядок: NEXT_PUBLIC_SITE_URL → адрес деплоя от Vercel → localhost.
 *
 * Почему не просто `?? localhost`: сборка на Vercel падала целиком с
 * `TypeError: Invalid URL, input: ''` на этапе «Collecting page data».
 * Причина — переменные были помечены Sensitive, а такие Vercel отдаёт только
 * в рантайме и на сборке подставляет ПУСТУЮ строку. `??` пустую строку
 * не отлавливает, она уезжала в `new URL('')`.
 *
 * Правильная настройка — не помечать NEXT_PUBLIC_* как Sensitive (они всё равно
 * попадают в бандл и секретами быть не могут). Но сборка не должна падать
 * из-за настройки в панели, поэтому здесь есть запас.
 */
export function getSiteUrl(): string {
  const explicit = env('NEXT_PUBLIC_SITE_URL')
  if (explicit) return stripSlash(explicit)
  const vercel = env('VERCEL_PROJECT_PRODUCTION_URL') ?? env('VERCEL_URL')
  if (vercel) return `https://${stripSlash(vercel)}`
  return 'http://localhost:3012'
}

/** Браузерный URL API. Форма заявки и события идут сюда напрямую, минуя хостинг фронта. */
export function getPublicApiUrl(): string {
  return stripSlash(env('NEXT_PUBLIC_API_URL') ?? '')
}

export function getServerApiUrl(): string {
  const server = env('API_URL')
  if (server) return stripSlash(server)
  return getPublicApiUrl()
}

export function useMockApi(): boolean {
  if (process.env.MOCK_API === '1') return true
  if (process.env.MOCK_API === '0') return false
  return !getServerApiUrl()
}

export function requestsUrl(): string {
  const api = getPublicApiUrl()
  return api ? `${api}/requests` : ''
}

export function claimsUrl(slug: string): string {
  const api = getPublicApiUrl()
  return api ? `${api}/companies/${encodeURIComponent(slug)}/claims` : ''
}

export function eventsUrl(): string {
  const api = getPublicApiUrl()
  return api ? `${api}/events` : ''
}
