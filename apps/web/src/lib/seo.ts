import type { Metadata } from 'next'
import { getSiteUrl } from './config'
import { categoryHref, companyHref } from './paths'
import type { CategoryNode, CompanyDetail } from './types'

const SITE_NAME = 'Агора'
const DEFAULT_TITLE = 'Каталог поставщиков упаковки в Москве — Агора'
const DEFAULT_DESCRIPTION =
  'Проверенные поставщики упаковки в Москве: гофрокороба, плёнка, скотч, пакеты. Оставьте заявку — подберём компании без регистрации.'

export function defaultMetadata(): Metadata {
  const site = getSiteUrl()
  return {
    metadataBase: new URL(site),
    title: { default: DEFAULT_TITLE, template: `%s — ${SITE_NAME}` },
    description: DEFAULT_DESCRIPTION,
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: SITE_NAME,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    },
  }
}

export function catalogMeta(): Metadata {
  return pageMeta({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
    absoluteTitle: true,
  })
}

export function categoryMeta(category: CategoryNode, city?: string): Metadata {
  const title =
    category.seo_title?.trim() ||
    (city ? `${category.name} в Москве — поставщики упаковки` : `${category.name} — поставщики упаковки`)
  const description =
    category.seo_description?.trim() ||
    (city
      ? `${category.name} в Москве: проверенные поставщики. Оставьте заявку — подберём производителей.`
      : `Поставщики: ${category.name}. Проверенные компании в Москве, заявка без регистрации.`)
  return pageMeta({
    title,
    description,
    path: categoryHref(category.slug, city),
    absoluteTitle: true,
  })
}

export function companyMeta(company: CompanyDetail): Metadata {
  const title = `${company.name} — поставщик упаковки в Москве`
  const description =
    company.description?.trim() ||
    `${company.name}${company.address ? `, ${company.address}` : ''} — карточка поставщика упаковки в каталоге Агора.`
  return pageMeta({
    title,
    description,
    path: companyHref(company.slug),
    absoluteTitle: true,
  })
}

export function searchMeta(q: string): Metadata {
  return pageMeta({
    title: q ? `Поиск: ${q}` : 'Поиск по каталогу',
    description: DEFAULT_DESCRIPTION,
    path: q ? `/search?q=${encodeURIComponent(q)}` : '/search',
    robots: { index: false, follow: true },
    absoluteTitle: false,
  })
}

export function requestsMeta(): Metadata {
  return pageMeta({
    title: 'Заявки',
    description: 'Заявок пока нет. Хотите разместить — отправьте описание запроса.',
    path: '/requests',
    robots: { index: false, follow: false },
    absoluteTitle: false,
  })
}

function pageMeta(opts: {
  title: string
  description: string
  path: string
  robots?: Metadata['robots']
  absoluteTitle: boolean
}): Metadata {
  const canonical = opts.path.startsWith('http') ? opts.path : opts.path
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical },
    robots: opts.robots,
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: canonical,
      locale: 'ru_RU',
      siteName: SITE_NAME,
      type: 'website',
    },
  }
}

export { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME }
