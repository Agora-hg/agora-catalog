'use client'

import { useEffect } from 'react'
import { startAnalytics } from '../lib/analytics'

type Props = {
  apiUrl: string
  path: string
}

/** Клиентский сборщик: cookie visitor 1 год, session 30 мин, sendBeacon, IO для card_view. */
export function ClientRuntime({ apiUrl, path }: Props) {
  useEffect(() => {
    if (!apiUrl) return
    return startAnalytics({ apiUrl, path })
  }, [apiUrl, path])

  return null
}
