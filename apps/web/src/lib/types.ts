/** Формы из docs/API.md. Поля не добавлять и не переименовывать. */

export type CategoryRef = {
  slug: string
  name: string
}

export type CategoryNode = {
  slug: string
  name: string
  seo_title?: string | null
  seo_description?: string | null
  children?: CategoryNode[]
}

export type CompanyCard = {
  slug: string
  name: string
  city: string
  address: string | null
  description: string | null
  categories: CategoryRef[]
  products_tags: string[]
  website: string | null
  is_verified: boolean
  checked_at: string
}

export type CompanySource = {
  source_type: string
  checked_at: string
}

export type CompanyDetail = CompanyCard & {
  legal_name: string | null
  inn: string | null
  ogrn: string | null
  kpp: string | null
  okved: string | null
  egrul_status: string | null
  phone: string | null
  email: string | null
  lat: number | null
  lon: number | null
  hours_raw: string | null
  sources: CompanySource[]
}

export type CompanyListResponse = {
  items: CompanyCard[]
  total: number
  page: number
  per_page: number
  /**
   * true — API не ответил, отдаём пустую витрину вместо падения.
   * Страница обязана открыться с кодом 200: за 500 поисковик выбрасывает
   * страницы из индекса, а SEO здесь — весь смысл продукта.
   */
  unavailable?: boolean
}

export type CompanyListQuery = {
  category?: string
  city?: string
  verified?: boolean
  q?: string
  page?: number
  per_page?: number
  sort?: 'recommended' | 'name'
}

export type Breadcrumb = {
  name: string
  href: string
}
