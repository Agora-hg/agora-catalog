import { findCategory, findParent, isTopLevel } from '@/lib/categories'
import { MOSCOW } from '@/lib/cities'
import { catalogHref, categoryHref } from '@/lib/paths'
import type { CategoryNode } from '@/lib/types'

export function Filters(props: {
  categories: CategoryNode[]
  categorySlug?: string
  citySlug?: string
  typeSlug?: string
}) {
  const { categories, categorySlug, citySlug, typeSlug } = props
  const current = categorySlug ? findCategory(categories, categorySlug) : undefined
  const parent = categorySlug ? findParent(categories, categorySlug) : undefined
  const top = current && isTopLevel(categories, current.slug) ? current : parent
  const types = top?.children ?? []
  const city = citySlug === MOSCOW.slug ? MOSCOW.slug : undefined

  return (
    <aside className="filters">
      <details className="filters-box panel" open>
        <summary>Фильтры</summary>
        <h2>Фильтры</h2>

        <h3>Категория упаковки</h3>
        <ul>
          <li>
            <a href={catalogHref({ city })} className={!categorySlug ? 'is-active' : undefined}>
              Все категории
            </a>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <a
                href={categoryHref(c.slug, city)}
                className={top?.slug === c.slug || categorySlug === c.slug ? 'is-active' : undefined}
                data-analytics="filter_apply"
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>

        <h3>Тип продукции</h3>
        {types.length > 0 ? (
          <ul>
            <li>
              <a
                href={top ? categoryHref(top.slug, city) : catalogHref({ city })}
                className={!typeSlug && top?.slug === categorySlug ? 'is-active' : undefined}
              >
                Все типы
              </a>
            </li>
            {types.map((t) => (
              <li key={t.slug}>
                <a
                  href={categoryHref(t.slug, city)}
                  className={categorySlug === t.slug || typeSlug === t.slug ? 'is-active' : undefined}
                  data-analytics="filter_apply"
                >
                  {t.name}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-note">Выберите категорию — появятся типы продукции.</p>
        )}

        <h3>Город</h3>
        <ul>
          <li>
            <a
              href={categorySlug ? categoryHref(categorySlug) : '/'}
              className={!city ? 'is-active' : undefined}
            >
              Все города
            </a>
          </li>
          <li>
            <a
              href={categorySlug ? categoryHref(categorySlug, MOSCOW.slug) : catalogHref({ city: MOSCOW.slug })}
              className={city ? 'is-active' : undefined}
              data-analytics="filter_apply"
            >
              Москва
            </a>
          </li>
        </ul>
      </details>
    </aside>
  )
}
