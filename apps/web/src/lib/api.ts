import { flattenCategories } from './categories'
import { DEFAULT_PER_PAGE, REVALIDATE_SECONDS, getServerApiUrl, useMockApi } from './config'
import { mockGet } from './mock'
import type { CategoryNode, CompanyDetail, CompanyListQuery, CompanyListResponse } from './types'

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

  const res = await fetch(`${getServerApiUrl()}${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: REVALIDATE_SECONDS },
  })

  if (res.status === 404) {
    throw new ApiError('not found', 404)
  }
  if (!res.ok) {
    throw new ApiError(`API ${path} → ${res.status}`, res.status)
  }
  return (await res.json()) as T
}

export async function fetchCategories(): Promise<CategoryNode[]> {
  const data = await apiGet<CategoryNode[] | { items: CategoryNode[] }>('/categories')
  return Array.isArray(data) ? data : data.items
}

export async function fetchCompanies(params: CompanyListQuery = {}): Promise<CompanyListResponse> {
  const query: CompanyListQuery = { per_page: DEFAULT_PER_PAGE, page: 1, ...params }
  if (query.q && !query.category && !query.city) {
    return apiGet<CompanyListResponse>(`/search${buildQuery(query)}`)
  }
  return apiGet<CompanyListResponse>(`/companies${buildQuery(query)}`)
}

export async function fetchCompany(slug: string): Promise<CompanyDetail | null> {
  try {
    const data = await apiGet<CompanyDetail | null>(`/companies/${encodeURIComponent(slug)}`)
    return data ?? null
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
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
