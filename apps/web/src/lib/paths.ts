export function catalogHref(opts: {
  category?: string
  city?: string
  type?: string
  q?: string
  page?: number
  sort?: string
}): string {
  const { category, city, type, q, page, sort } = opts
  let path = '/'
  if (category && city) path = `/category/${category}/${city}`
  else if (category) path = `/category/${category}`
  else if (q) path = '/search'

  const sp = new URLSearchParams()
  if (type) sp.set('type', type)
  if (q && path === '/search') sp.set('q', q)
  else if (q) sp.set('q', q)
  if (!category && city) sp.set('city', city)
  if (sort && sort !== 'recommended') sp.set('sort', sort)
  if (page && page > 1) sp.set('page', String(page))
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}

export function companyHref(slug: string): string {
  return `/company/${slug}`
}

export function categoryHref(slug: string, city?: string): string {
  return city ? `/category/${slug}/${city}` : `/category/${slug}`
}
