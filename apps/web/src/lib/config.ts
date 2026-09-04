/** ISR 15 минут — список компаний не рендерится на клиенте. */
export const REVALIDATE_SECONDS = 900
export const DEFAULT_PER_PAGE = 24

function stripSlash(value: string): string {
  return value.replace(/\/$/, '')
}

export function getSiteUrl(): string {
  return stripSlash(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3012')
}

/** Браузерный URL API. Форма заявки и события идут сюда напрямую, минуя хостинг фронта. */
export function getPublicApiUrl(): string {
  return stripSlash(process.env.NEXT_PUBLIC_API_URL ?? '')
}

export function getServerApiUrl(): string {
  const server = process.env.API_URL?.trim()
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
