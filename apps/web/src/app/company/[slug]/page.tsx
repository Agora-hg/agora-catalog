import { ClaimForm } from '@/components/ClaimForm'
import { JsonLd } from '@/components/JsonLd'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { RequestForm } from '@/components/RequestForm'
import { Requisites } from '@/components/Requisites'
import { fetchAllCompanySlugs, fetchCompany } from '@/lib/api'
import { formatCheckedAt } from '@/lib/format'
import { categoryHref, companyHref } from '@/lib/paths'
import { breadcrumbJsonLd, companyJsonLd } from '@/lib/schema-org'
import { companyMeta } from '@/lib/seo'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const revalidate = 900
export const runtime = 'nodejs'

export async function generateStaticParams() {
  const slugs = await fetchAllCompanySlugs()
  return slugs.map((slug) => ({ slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = await fetchCompany(slug)
  if (!company) return {}
  return companyMeta(company)
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const company = await fetchCompany(slug)
  if (!company) notFound()

  const cat = company.categories[0]
  const breadcrumbs = [
    { name: 'Каталог', href: '/' },
    ...(cat
      ? [
          { name: cat.name, href: categoryHref(cat.slug) },
          { name: `${cat.name} в Москве`, href: categoryHref(cat.slug, 'moskva') },
        ]
      : []),
    { name: company.name, href: companyHref(company.slug) },
  ]
  const checked = formatCheckedAt(company.checked_at)

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />
      <JsonLd data={companyJsonLd(company)} />

      <Breadcrumbs items={breadcrumbs} />

      <article className="card company-hero" data-card-slug={company.slug}>
        <div className="card-top">
          <h1 className="page-title" style={{ margin: 0 }}>
            {company.name}
          </h1>
          {company.is_verified ? <span className="badge">Проверена</span> : null}
        </div>
        {company.address ? <p className="address">{company.address}</p> : null}
        {company.description ? <p className="desc">{company.description}</p> : null}
        {company.categories.length > 0 ? (
          <ul className="cats">
            {company.categories.map((c) => (
              <li key={c.slug}>
                <a href={categoryHref(c.slug)}>{c.name}</a>
              </li>
            ))}
            {company.categories.map((c) => (
              <li key={`${c.slug}-moskva`}>
                <a href={categoryHref(c.slug, 'moskva')}>{c.name} в Москве</a>
              </li>
            ))}
          </ul>
        ) : null}
        {company.products_tags.length > 0 ? (
          <ul className="cats">
            {company.products_tags.map((t) => (
              <li key={t}>
                <span className="tag">{t}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {checked ? <p className="checked">Информация проверена {checked}</p> : null}
        <div className="actions">
          {company.website ? (
            <a
              className="btn"
              href={company.website}
              rel="nofollow noopener noreferrer"
              target="_blank"
              data-analytics="website_click"
              data-slug={company.slug}
            >
              Сайт
            </a>
          ) : null}
          <a className="btn btn-ghost" href="#request">
            Нужна упаковка
          </a>
        </div>
        <Requisites company={company} />
        <p className="claim">
          Вы представитель этой компании?{' '}
          <a href="#claim" data-analytics="claim_open" data-slug={company.slug}>
            Сообщить об ошибке / обновить информацию
          </a>
        </p>
      </article>

      <div className="catalog" style={{ gridTemplateColumns: 'minmax(0,1fr) 20rem' }}>
        <ClaimForm slug={company.slug} />
        <RequestForm categorySlug={cat?.slug} compact />
      </div>
    </>
  )
}
