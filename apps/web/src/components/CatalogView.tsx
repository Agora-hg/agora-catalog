import { DEFAULT_PER_PAGE } from '@/lib/config'
import { catalogHref, categoryHref } from '@/lib/paths'
import { breadcrumbJsonLd, collectionPageJsonLd, itemListJsonLd } from '@/lib/schema-org'
import type { Breadcrumb, CategoryNode, CompanyListResponse } from '@/lib/types'
import { Breadcrumbs } from './Breadcrumbs'
import { CompanyCard } from './CompanyCard'
import { Filters } from './Filters'
import { JsonLd } from './JsonLd'
import { Pagination } from './Pagination'
import { RequestForm } from './RequestForm'

export function CatalogView(props: {
  title: string
  description: string
  introText?: string
  breadcrumbs: Breadcrumb[]
  categories: CategoryNode[]
  relatedSlugs?: string[]
  list: CompanyListResponse
  categorySlug?: string
  citySlug?: string
  typeSlug?: string
  q?: string
  sort?: 'recommended' | 'name'
  pageUrl: string
}) {
  const { list, categorySlug, citySlug, typeSlug, q, sort = 'recommended', relatedSlugs = [] } = props
  const recHref = catalogHref({ category: categorySlug, city: citySlug, type: typeSlug, q, sort: 'recommended' })
  const nameHref = catalogHref({ category: categorySlug, city: citySlug, type: typeSlug, q, sort: 'name' })

  const relatedCategories = relatedSlugs.map((slug) => {
    const found = props.categories.find((c) => c.slug === slug)
    return {
      slug,
      name: found ? found.name : slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    }
  })

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(props.breadcrumbs)} />
      <JsonLd
        data={collectionPageJsonLd({
          name: props.title,
          description: props.description,
          url: props.pageUrl,
        })}
      />
      <JsonLd data={itemListJsonLd(list.items, props.pageUrl)} />

      <Breadcrumbs items={props.breadcrumbs} />
      <h1 className="page-title">{props.title}</h1>
      <p className="lead">{props.introText || props.description}</p>

      {/*
        Ряд доверия под заголовком. Число берём из ответа API, а не из константы:
        каталог пополняется, и захардкоженная цифра рано или поздно начнёт врать.
        Остальные пункты — то, что мы действительно делаем, без обещаний вроде
        «лучшие цены», которых мы не проверяем.
      */}
      <ul className="trust">
        <li>{list.total} поставщиков</li>
        <li>Проверяем контакты вручную</li>
        <li>Адреса и телефоны с карт</li>
        <li>Бесплатно и без регистрации</li>
      </ul>

      <div className="catalog">
        <Filters
          categories={props.categories}
          categorySlug={categorySlug}
          citySlug={citySlug}
          typeSlug={typeSlug}
        />

        <section>
          <div className="list-head">
            <p className="count">
              {list.total === 0 ? 'Ничего не найдено' : `Найдено: ${list.total}`}
            </p>
            <p className="sort">
              <a href={recHref} className={sort === 'recommended' ? 'is-active' : undefined}>
                Рекомендуемые
              </a>
              <a href={nameHref} className={sort === 'name' ? 'is-active' : undefined}>
                По имени
              </a>
            </p>
          </div>
          {list.items.length === 0 ? (
            <div className="empty">В этой выборке пока нет поставщиков. Измените фильтр или оставьте заявку.</div>
          ) : (
            <div className="cards">
              {list.items.map((company) => (
                <CompanyCard key={company.slug} company={company} citySlug={citySlug} />
              ))}
            </div>
          )}
          <Pagination
            page={list.page}
            perPage={list.per_page || DEFAULT_PER_PAGE}
            total={list.total}
            category={categorySlug}
            city={citySlug}
            type={typeSlug}
            q={q}
            sort={sort}
          />
          {relatedCategories.length > 0 ? (
            <nav className="related-cats panel" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Сопутствующие категории упаковки</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {relatedCategories.map((c) => (
                  <li key={c.slug}>
                    <a
                      href={categoryHref(c.slug, citySlug)}
                      style={{
                        display: 'inline-block',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '8px',
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        fontSize: '0.88rem',
                        fontWeight: 500,
                      }}
                    >
                      {c.name}{citySlug ? ' в Москве' : ''}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </section>

        <RequestForm categorySlug={categorySlug} compact />
      </div>
    </>
  )
}
