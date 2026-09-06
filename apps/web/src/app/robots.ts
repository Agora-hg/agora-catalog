import { getSiteUrl, isPublicIndexable } from '@/lib/config'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl()
  const indexable = isPublicIndexable()

  return {
    rules: [
      {
        userAgent: '*',
        ...(indexable
          ? { allow: '/', disallow: ['/search', '/requests'] }
          : { disallow: '/' }),
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
