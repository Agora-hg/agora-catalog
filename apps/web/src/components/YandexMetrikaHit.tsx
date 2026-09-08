'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * init счётчика уже считает первый HTML. Клиентские переходы Next.js
 * без hit в Метрику не попадают — фильтры и карточки стали бы невидимы.
 */
export function YandexMetrikaHit({ id }: { id: string }) {
  const pathname = usePathname()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const ym = (window as unknown as { ym?: (counter: number, method: string, url: string) => void }).ym
    if (typeof ym === 'function') ym(Number(id), 'hit', pathname)
  }, [id, pathname])

  return null
}
