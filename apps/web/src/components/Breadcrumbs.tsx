import type { Breadcrumb } from '@/lib/types'

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Навигация">
      <ol className="crumbs">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={item.href}>
              {last ? <span>{item.name}</span> : <a href={item.href}>{item.name}</a>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
