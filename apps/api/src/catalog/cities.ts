const CITY_BY_SLUG: Record<string, string> = {
  moskva: 'Москва',
  moscow: 'Москва',
}

/** City display name to compare with companies.city. */
export function cityNameForSlug(slug: string): string {
  const key = slug.trim().toLowerCase()
  return CITY_BY_SLUG[key] ?? slug.trim()
}
