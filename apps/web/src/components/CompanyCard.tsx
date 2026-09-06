import { formatCheckedAt } from '@/lib/format'
import { categoryHref, companyHref } from '@/lib/paths'
import type { CompanyCard as CompanyCardType, CompanyDetail } from '@/lib/types'
import { Requisites } from './Requisites'

/**
 * Монограмма вместо логотипа.
 *
 * Логотипов у нас нет и не будет: данные пришли с Яндекс.Карт, картинки оттуда
 * тянуть нельзя. Пустой квадрат-заглушка выглядит как поломка, поэтому берём
 * первые буквы названия — карточка получает опору для глаза и перестаёт быть
 * стеной текста.
 */
function monogram(name: string): string {
  const words = name
    .replace(/^(ООО|АО|ЗАО|ИП|ПАО|ТД)\s+/i, '')
    .replace(/[«»"']/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/** Ровно 6 оттенков: цвет стабильно привязан к названию, при перезагрузке не скачет. */
function monogramTone(name: string): string {
  let sum = 0
  for (const ch of name) sum = (sum + ch.charCodeAt(0)) % 997
  return `tone-${sum % 6}`
}

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
      <div className="card-head">
        <span className={`mono ${monogramTone(company.name)}`} aria-hidden="true">
          {monogram(company.name)}
        </span>
        <div className="card-ident">
          <h2>
            <a href={moreHref}>{company.name}</a>
            {company.is_verified ? (
              <span className="check" title="Проверена вручную" aria-label="Проверена вручную">
                ✓
              </span>
            ) : null}
          </h2>
          {company.address ? (
            <p className="address">{company.address}</p>
          ) : company.city ? (
            <p className="address">{company.city}</p>
          ) : null}
        </div>
      </div>

      {company.description ? <p className="desc">{company.description}</p> : null}

      {company.categories.length > 0 ? (
        <ul className="cats">
          {company.categories.slice(0, 5).map((cat) => (
            <li key={cat.slug}>
              <a href={categoryHref(cat.slug, citySlug)}>{cat.name}</a>
            </li>
          ))}
          {company.categories.length > 5 ? (
            <li className="cats-more">
              <a href={moreHref}>ещё {company.categories.length - 5}</a>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="card-foot">
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
          {/*
            Заявка прямо из карточки. Форма одна и живёт в правой колонке —
            ссылка ведёт к ней и подставляет компанию. Смысл продукта в заявках,
            а не в просмотрах, поэтому призыв должен быть у каждой карточки,
            а не только в сайдбаре, куда на мобильном надо доскроллить до низа.
          */}
          <a
            className="btn btn-primary"
            href="#request"
            data-analytics="request_form_open"
            data-slug={company.slug}
          >
            Оставить заявку
          </a>
        </div>
      </div>

      {expanded && detail ? <Requisites company={detail} /> : null}
    </article>
  )
}
