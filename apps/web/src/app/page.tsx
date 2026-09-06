import { CatalogView } from '@/components/CatalogView'
import { fetchCategories, fetchCompanies } from '@/lib/api'
import { MOSCOW, apiCityParam } from '@/lib/cities'
import { firstParam, parsePage } from '@/lib/format'
import { catalogMeta } from '@/lib/seo'
import type { Metadata } from 'next'

export const revalidate = 900
export const runtime = 'nodejs'

export const metadata: Metadata = catalogMeta()

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const city = firstParam(sp.city)
  const q = firstParam(sp.q)
  const sort = firstParam(sp.sort) === 'name' ? 'name' : 'recommended'
  const page = parsePage(sp.page)
  const type = firstParam(sp.type)

  const [categories, list] = await Promise.all([
    fetchCategories(),
    fetchCompanies({
      city: apiCityParam(city),
      q,
      page,
      sort,
      category: type,
    }),
  ])

  const title = city === MOSCOW.slug ? 'Каталог поставщиков упаковки в Москве' : 'Каталог поставщиков упаковки'
  const description =
    'Проверенные поставщики гофрокоробов, плёнки, скотча и пакетов. Оставьте заявку — подберём компании в Москве.'

  return (
    <CatalogView
      title={title}
      description={description}
      breadcrumbs={[{ name: 'Каталог', href: '/' }]}
      categories={categories}
      list={list}
      citySlug={city}
      typeSlug={type}
      q={q}
      sort={sort}
      pageUrl="/"
    />
  )
}
