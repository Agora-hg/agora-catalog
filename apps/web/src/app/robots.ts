import { getSiteUrl } from '@/lib/config'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/search', '/requests'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
