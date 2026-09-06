export type City = {
  slug: string
  name: string
  namePrep: string
}

/** V0 — только Москва. Схема API готова к городам, данных не будет. */
export const CITIES: City[] = [{ slug: 'moskva', name: 'Москва', namePrep: 'в Москве' }]

export const MOSCOW = CITIES[0]!

export function cityBySlug(slug: string | undefined): City | undefined {
  if (!slug) return undefined
  return CITIES.find((c) => c.slug === slug)
}

export function cityByName(name: string | undefined): City | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase()
  return CITIES.find((c) => c.name.toLowerCase() === lower || c.slug === lower)
}

/** Значение `city` для API: slug, как в docs/API.md. */
export function apiCityParam(slug: string | undefined): string | undefined {
  return cityBySlug(slug)?.slug
}
