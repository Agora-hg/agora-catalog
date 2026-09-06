import { CatalogView } from '@/components/CatalogView'
import { fetchCategories, fetchCompanies } from '@/lib/api'
import { firstParam, parsePage } from '@/lib/format'
import { searchMeta } from '@/lib/seo'
import type { Metadata } from 'next'

export const revalidate = 900
export const runtime = 'nodejs'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams
  return searchMeta(firstParam(sp.q) ?? '')
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const q = firstParam(sp.q) ?? ''
  const sort = firstParam(sp.sort) === 'name' ? 'name' : 'recommended'
  const page = parsePage(sp.page)

  const [categories, list] = await Promise.all([
    fetchCategories(),
    fetchCompanies({ q, page, sort }),
  ])

  const title = q ? `Поиск: ${q}` : 'Поиск по каталогу'
  const description = q
    ? `Результаты поиска «${q}» среди поставщиков упаковки в Москве.`
    : 'Поиск по компаниям и видам упаковки.'

  return (
    <CatalogView
      title={title}
      description={description}
      breadcrumbs={[
        { name: 'Каталог', href: '/' },
        { name: 'Поиск', href: '/search' },
      ]}
      categories={categories}
      list={list}
      q={q}
      sort={sort}
      pageUrl="/search"
    />
  )
}
