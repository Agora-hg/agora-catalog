import { CatalogView } from '@/components/CatalogView'
import { fetchCategories, fetchCompanies } from '@/lib/api'
import { findCategory } from '@/lib/categories'
import { MOSCOW } from '@/lib/cities'
import { firstParam, parsePage } from '@/lib/format'
import { categoryHref } from '@/lib/paths'
import { categoryMeta } from '@/lib/seo'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * Рендер на сервере по запросу, а не ISR.
 *
 * Причина: страница читает searchParams (город, тип, сортировка, страница),
 * а это несовместимо с generateStaticParams — Next падает с DYNAMIC_SERVER_USAGE.
 * Ловится не сразу: пока API недоступен, generateStaticParams отдаёт пустой список,
 * сборка проходит, и 500 прилетает только на живом запросе.
 *
 * Для SEO это не потеря: роботу важен готовый HTML в ответе, а он есть.
 * Кэш живёт на стороне API (10 минут), трафика в V0 всё равно нет.
 * Если понадобится ISR — фильтры надо будет унести на клиент, а не возвращать
 * generateStaticParams обратно.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

import { getCategoryContent } from '@/lib/category-content'

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const sp = await searchParams
  const categories = await fetchCategories()
  const category = findCategory(categories, slug)
  if (!category) return {}
  const meta = categoryMeta(category, MOSCOW.slug)
  const hasFilterParams = Boolean(sp?.type || sp?.sort || sp?.page || sp?.q)
  if (hasFilterParams) {
    return {
      ...meta,
      robots: { index: false, follow: true },
      alternates: { canonical: categoryHref(slug, MOSCOW.slug) },
    }
  }
  return meta
}

export default async function CategoryMoscowPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const sort = firstParam(sp.sort) === 'name' ? 'name' : 'recommended'
  const page = parsePage(sp.page)
  const type = firstParam(sp.type)
  const q = firstParam(sp.q)

  const categories = await fetchCategories()
  const category = findCategory(categories, slug)
  if (!category) notFound()

  const list = await fetchCompanies({
    category: type || slug,
    city: MOSCOW.slug,
    page,
    sort,
    q,
  })

  const content = getCategoryContent(slug, MOSCOW.slug)
  const title = category.seo_title?.trim() || content.moscowH1
  const description = category.seo_description?.trim() || content.moscowMetaDescription

  return (
    <CatalogView
      title={title}
      description={description}
      introText={content.moscowIntroText}
      breadcrumbs={[
        { name: 'Каталог', href: '/' },
        { name: category.name, href: categoryHref(slug) },
        { name: 'Москва', href: categoryHref(slug, MOSCOW.slug) },
      ]}
      categories={categories}
      relatedSlugs={content.relatedSlugs}
      list={list}
      categorySlug={slug}
      citySlug={MOSCOW.slug}
      typeSlug={type}
      q={q}
      sort={sort}
      pageUrl={categoryHref(slug, MOSCOW.slug)}
    />
  )
}
