import { fetchAllCategorySlugs, fetchAllCompanySlugs } from './api'
import { getSiteUrl } from './config'
import { categoryHref, companyHref } from './paths'

export type SitemapEntry = {
  url: string
  lastModified?: Date
  changeFrequency?: 'daily' | 'weekly' | 'monthly'
  priority?: number
}

export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const site = getSiteUrl()
  const [categories, companies] = await Promise.all([fetchAllCategorySlugs(), fetchAllCompanySlugs()])

  const entries: SitemapEntry[] = [
    { url: `${site}/`, changeFrequency: 'daily', priority: 1 },
  ]

  for (const slug of categories) {
    entries.push({
      url: `${site}${categoryHref(slug)}`,
      changeFrequency: 'daily',
      priority: 0.9,
    })
    entries.push({
      url: `${site}${categoryHref(slug, 'moskva')}`,
      changeFrequency: 'daily',
      priority: 0.95,
    })
  }

  for (const slug of companies) {
    entries.push({
      url: `${site}${companyHref(slug)}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  return entries
}
