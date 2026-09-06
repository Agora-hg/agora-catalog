import { formatCheckedAt } from '@/lib/format'
import { categoryHref, companyHref } from '@/lib/paths'
import type { CompanyCard as CompanyCardType, CompanyDetail } from '@/lib/types'
import { Requisites } from './Requisites'

export function CompanyCard(props: {
  company: CompanyCardType
  citySlug?: string
  expanded?: boolean
  detail?: CompanyDetail | null
}) {
  const { company, citySlug, expanded, detail } = props
  const checked = formatCheckedAt(company.checked_at)
  const moreHref = companyHref(company.slug)

  return (
    <article className="card" data-card-slug={company.slug}>
      <div className="card-top">
        <h2>
          <a href={moreHref}>{company.name}</a>
        </h2>
        {company.is_verified ? <span className="badge">Проверена</span> : null}
      </div>
      {company.address ? <p className="address">{company.address}</p> : company.city ? <p className="address">{company.city}</p> : null}
      {company.description ? <p className="desc">{company.description}</p> : null}
      {company.categories.length > 0 ? (
        <ul className="cats">
          {company.categories.map((cat) => (
            <li key={cat.slug}>
              <a href={categoryHref(cat.slug, citySlug)}>{cat.name}</a>
            </li>
          ))}
        </ul>
      ) : null}
      {checked ? <p className="checked">Информация проверена {checked}</p> : null}
      <div className="actions">
        <a className="btn" href={moreHref} data-analytics="card_expand" data-slug={company.slug}>
          Подробнее
        </a>
        {company.website ? (
          <a
            className="btn btn-ghost"
            href={company.website}
            rel="nofollow noopener noreferrer"
            target="_blank"
            data-analytics="website_click"
            data-slug={company.slug}
          >
            Сайт
          </a>
        ) : null}
      </div>
      {expanded && detail ? <Requisites company={detail} /> : null}
      <p className="claim">
        Вы представитель этой компании?{' '}
        <a href={`${moreHref}#claim`} data-analytics="claim_open" data-slug={company.slug}>
          Сообщить об ошибке / обновить информацию
        </a>
      </p>
    </article>
  )
}
