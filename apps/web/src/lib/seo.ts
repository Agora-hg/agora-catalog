import type { Metadata } from 'next'

/**
 * new URL() на мусорном значении обрушивает всю сборку Next на этапе
 * «Collecting page data», причём с сообщением, по которому не видно, какая
 * переменная виновата. Лучше отдать заведомо валидный адрес и жить.
 */
function safeMetadataBase(site: string): URL {
  try {
    return new URL(site)
  } catch {
    return new URL('http://localhost:3012')
  }
}
import { getSiteUrl, isPublicIndexable } from './config'
import { getCategoryContent } from './category-content'
import { categoryHref, companyHref } from './paths'
import type { CategoryNode, CompanyDetail } from './types'

const SITE_NAME = 'Агора'
const DEFAULT_TITLE = 'Каталог поставщиков упаковки в Москве — Агора'
const DEFAULT_DESCRIPTION =
  'Проверенные поставщики упаковки в Москве: гофрокороба, плёнка, скотч, пакеты. Оставьте заявку — подберём компании без регистрации.'

/**
 * Коды подтверждения прав для Яндекс.Вебмастера и Google Search Console.
 *
 * Кладутся в переменные окружения, а не в код: у каждого домена свой код,
 * и при переезде его придётся менять без пересборки логики. Пустые значения
 * просто не выводят мета-тег.
 */
function verification(): Metadata['verification'] {
  const yandex = process.env.YANDEX_VERIFICATION?.trim()
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim()
  if (!yandex && !google) return undefined
  return {
    ...(yandex ? { yandex } : {}),
    ...(google ? { google } : {}),
  }
}

export function defaultMetadata(): Metadata {
  const site = getSiteUrl()
  const indexable = isPublicIndexable()
  return {
    metadataBase: safeMetadataBase(site),
    title: { default: DEFAULT_TITLE, template: `%s — ${SITE_NAME}` },
    description: DEFAULT_DESCRIPTION,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    verification: verification(),
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
  const content = getCategoryContent(category.slug, city)
  const isMoscow = city === 'moskva' || city === 'moscow'
  const title = isMoscow
    ? category.seo_title?.trim() || content.moscowTitle
    : category.seo_title && !category.seo_title.includes('в Москве')
      ? category.seo_title.trim()
      : content.title
  const description = isMoscow
    ? category.seo_description?.trim() || content.moscowMetaDescription
    : category.seo_description && !category.seo_description.includes('в Москве')
      ? category.seo_description.trim()
      : content.metaDescription
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
  const indexable = isPublicIndexable()
  const defaultRobots: Metadata['robots'] = indexable
    ? { index: true, follow: true }
    : { index: false, follow: false }
  const robots = !indexable ? { index: false, follow: false } : (opts.robots ?? defaultRobots)
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical },
    robots,
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
