import { flattenCategories } from './categories'
import { DEFAULT_PER_PAGE, REVALIDATE_SECONDS, getServerApiUrl, useMockApi } from './config'
import { mockGet } from './mock'
import type { CategoryNode, CompanyDetail, CompanyListQuery, CompanyListResponse } from './types'

/** API недоступен целиком: сеть, таймаут, 5xx. Не то же самое, что 404. */
export class ApiUnavailableError extends Error {}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function buildQuery(params: CompanyListQuery): string {
  const sp = new URLSearchParams()
  if (params.category) sp.set('category', params.category)
  if (params.city) sp.set('city', params.city)
  if (params.verified) sp.set('verified', '1')
  if (params.q) sp.set('q', params.q)
  if (params.page && params.page > 1) sp.set('page', String(params.page))
  if (params.per_page && params.per_page !== DEFAULT_PER_PAGE) sp.set('per_page', String(params.per_page))
  if (params.sort && params.sort !== 'recommended') sp.set('sort', params.sort)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

async function apiGet<T>(path: string): Promise<T> {
  if (useMockApi()) return mockGet(path) as T

  let res: Response
  try {
    res = await fetch(`${getServerApiUrl()}${path}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    // Сеть, DNS, таймаут, неверный адрес в переменной окружения.
    throw new ApiUnavailableError(`API недоступен: ${path} (${String(err)})`)
  }

  if (res.status === 404) {
    throw new ApiError('not found', 404)
  }
  if (res.status >= 500) {
    throw new ApiUnavailableError(`API ${path} → ${res.status}`)
  }
  if (!res.ok) {
    throw new ApiError(`API ${path} → ${res.status}`, res.status)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiUnavailableError(`API ${path}: ответ не JSON`)
  }
}

export async function fetchCategories(): Promise<CategoryNode[]> {
  try {
    const data = await apiGet<CategoryNode[] | { items: CategoryNode[] }>('/categories')
    return Array.isArray(data) ? data : data.items
  } catch (err) {
    if (err instanceof ApiUnavailableError) {
      console.error('[categories]', err.message)
      return []
    }
    throw err
  }
}

export async function fetchCompanies(params: CompanyListQuery = {}): Promise<CompanyListResponse> {
  const query: CompanyListQuery = { per_page: DEFAULT_PER_PAGE, page: 1, ...params }
  const path = query.q && !query.category && !query.city
    ? `/search${buildQuery(query)}`
    : `/companies${buildQuery(query)}`
  try {
    return await apiGet<CompanyListResponse>(path)
  } catch (err) {
    // Недоступность API не должна ронять страницу в 500: отдаём пустую витрину
    // с кодом 200 и пометкой. Пятисотка стоит нам выпадения из индекса.
    if (err instanceof ApiUnavailableError) {
      console.error('[catalog]', err.message)
      return { items: [], total: 0, page: query.page ?? 1, per_page: query.per_page ?? DEFAULT_PER_PAGE, unavailable: true }
    }
    throw err
  }
}

export async function fetchCompany(slug: string): Promise<CompanyDetail | null> {
  try {
    const data = await apiGet<CompanyDetail | null>(`/companies/${encodeURIComponent(slug)}`)
    return data ?? null
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    // Недоступный API на карточке компании — это 404, а не 500: страница
    // отрисуется штатной «не найдено», сайт продолжит работать.
    if (err instanceof ApiUnavailableError) {
      console.error('[company]', err.message)
      return null
    }
    if (useMockApi()) return null
    throw err
  }
}

export async function fetchAllCompanySlugs(): Promise<string[]> {
  const slugs: string[] = []
  let page = 1
  const perPage = 100
  for (;;) {
    const res = await fetchCompanies({ page, per_page: perPage })
    if (res.unavailable) break
    for (const item of res.items) slugs.push(item.slug)
    if (res.items.length < perPage || slugs.length >= res.total) break
    page += 1
    if (page > 100) break
  }
  return slugs
}

export async function fetchAllCategorySlugs(): Promise<string[]> {
  const tree = await fetchCategories()
  return flattenCategories(tree).map((c) => c.slug)
}
