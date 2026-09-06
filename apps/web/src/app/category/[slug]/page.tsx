import { CatalogView } from '@/components/CatalogView'
import { fetchAllCategorySlugs, fetchCategories, fetchCompanies } from '@/lib/api'
import { findCategory } from '@/lib/categories'
import { apiCityParam } from '@/lib/cities'
import { firstParam, parsePage } from '@/lib/format'
import { categoryHref } from '@/lib/paths'
import { categoryMeta } from '@/lib/seo'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const revalidate = 900
export const runtime = 'nodejs'

export async function generateStaticParams() {
  const slugs = await fetchAllCategorySlugs()
  return slugs.map((slug) => ({ slug }))
}

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const categories = await fetchCategories()
  const category = findCategory(categories, slug)
  if (!category) return {}
  return categoryMeta(category)
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const city = firstParam(sp.city)
  const sort = firstParam(sp.sort) === 'name' ? 'name' : 'recommended'
  const page = parsePage(sp.page)
  const type = firstParam(sp.type)
  const q = firstParam(sp.q)

  const categories = await fetchCategories()
  const category = findCategory(categories, slug)
  if (!category) notFound()

  const list = await fetchCompanies({
    category: type || slug,
    city: apiCityParam(city),
    page,
    sort,
    q,
  })

  const title = category.seo_title?.trim() || `${category.name} — поставщики упаковки`
  const description =
    category.seo_description?.trim() ||
    `Поставщики: ${category.name}. Проверенные компании в Москве, заявка без регистрации.`

  return (
    <CatalogView
      title={title}
      description={description}
      breadcrumbs={[
        { name: 'Каталог', href: '/' },
        { name: category.name, href: categoryHref(slug) },
      ]}
      categories={categories}
      list={list}
      categorySlug={slug}
      citySlug={city}
      typeSlug={type}
      q={q}
      sort={sort}
      pageUrl={categoryHref(slug)}
    />
  )
}
