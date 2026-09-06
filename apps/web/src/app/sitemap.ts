import { buildSitemapEntries } from '@/lib/sitemap-data'
import type { MetadataRoute } from 'next'

export const revalidate = 900
export const runtime = 'nodejs'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await buildSitemapEntries()
  return entries.map((e) => ({
    url: e.url,
    lastModified: e.lastModified,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }))
}
