import { getSiteUrl } from './config'
import { companyHref } from './paths'
import type { Breadcrumb, CompanyCard, CompanyDetail } from './types'

function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function absolute(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${getSiteUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

export function breadcrumbJsonLd(items: Breadcrumb[]) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.href),
    })),
  })
}

function organizationFields(company: CompanyCard | CompanyDetail) {
  const detail = company as CompanyDetail
  const address = company.address
    ? {
        '@type': 'PostalAddress',
        streetAddress: company.address,
        addressLocality: company.city || 'Москва',
        addressCountry: 'RU',
      }
    : company.city
      ? {
          '@type': 'PostalAddress',
          addressLocality: company.city,
          addressCountry: 'RU',
        }
      : undefined

  return {
    '@type': ['Organization', 'LocalBusiness'],
    '@id': absolute(companyHref(company.slug)),
    name: company.name,
    legalName: detail.legal_name || undefined,
    description: company.description || undefined,
    url: absolute(companyHref(company.slug)),
    sameAs: company.website || undefined,
    address,
    telephone: detail.phone || undefined,
    taxID: detail.inn || undefined,
    identifier: detail.ogrn ? { '@type': 'PropertyValue', name: 'ОГРН', value: detail.ogrn } : undefined,
    geo:
      detail.lat != null && detail.lon != null
        ? { '@type': 'GeoCoordinates', latitude: detail.lat, longitude: detail.lon }
        : undefined,
    openingHours: detail.hours_raw || undefined,
    areaServed: company.city || 'Москва',
  }
}

export function companyJsonLd(company: CompanyCard | CompanyDetail) {
  return compact({
    '@context': 'https://schema.org',
    ...organizationFields(company),
  })
}

export function itemListJsonLd(companies: CompanyCard[], pageUrl: string) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: absolute(pageUrl),
    numberOfItems: companies.length,
    itemListElement: companies.map((company, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: company.name,
      url: absolute(companyHref(company.slug)),
      item: organizationFields(company),
    })),
  })
}

export function collectionPageJsonLd(opts: {
  name: string
  description: string
  url: string
}) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: absolute(opts.url),
    isPartOf: {
      '@type': 'WebSite',
      name: 'Агора',
      url: getSiteUrl(),
    },
  })
}
