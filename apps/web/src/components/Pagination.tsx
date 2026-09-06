import { catalogHref } from '@/lib/paths'

export function Pagination(props: {
  page: number
  perPage: number
  total: number
  category?: string
  city?: string
  type?: string
  q?: string
  sort?: string
}) {
  const pages = Math.max(1, Math.ceil(props.total / props.perPage))
  if (pages <= 1) return null

  const href = (page: number) =>
    catalogHref({
      category: props.category,
      city: props.city,
      type: props.type,
      q: props.q,
      sort: props.sort,
      page,
    })

  const items: number[] = []
  for (let i = 1; i <= pages; i++) items.push(i)

  return (
    <nav className="pager" aria-label="Страницы">
      {items.map((n) =>
        n === props.page ? (
          <span key={n} className="is-active" aria-current="page">
            {n}
          </span>
        ) : (
          <a key={n} href={href(n)}>
            {n}
          </a>
        ),
      )}
    </nav>
  )
}
