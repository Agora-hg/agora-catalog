'use client'

import { useEffect } from 'react'

type Props = {
  apiUrl: string
  path: string
}

const VISITOR_KEY = 'av'
const SESSION_KEY = 'as'
const SESSION_TTL_MS = 30 * 60 * 1000
const VISITOR_TTL_SEC = 365 * 24 * 3600
const BUFFER_MAX = 50

type EventName =
  | 'page_view'
  | 'card_view'
  | 'card_expand'
  | 'website_click'
  | 'filter_apply'
  | 'search'
  | 'request_form_open'
  | 'request_submit'
  | 'claim_open'
  | 'claim_submit'

type AnalyticsEvent = {
  visitor_id: string
  session_id: string
  event: EventName
  path: string
  referrer: string
  company_id?: string
  payload?: Record<string, unknown>
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readCookie(name: string): string | undefined {
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

function writeCookie(name: string, value: string, maxAgeSec: number) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secure}`
}

function visitorId(): string {
  let id = readCookie(VISITOR_KEY)
  if (!id) {
    id = uuid()
    writeCookie(VISITOR_KEY, id, VISITOR_TTL_SEC)
  } else {
    writeCookie(VISITOR_KEY, id, VISITOR_TTL_SEC)
  }
  return id
}

function sessionId(): string {
  const now = Date.now()
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id: string; at: number }
      if (now - parsed.at < SESSION_TTL_MS) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, at: now }))
        return parsed.id
      }
    } catch {
      /* ignore */
    }
  }
  const id = uuid()
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }))
  return id
}

export function ClientRuntime({ apiUrl, path }: Props) {
  useEffect(() => {
    if (!apiUrl) return

    const buffer: AnalyticsEvent[] = []
    const viewed = new Set<string>()
    const endpoint = `${apiUrl.replace(/\/$/, '')}/events`
    const vid = visitorId()
    const sid = sessionId()

    const flush = () => {
      if (buffer.length === 0) return
      const batch = buffer.splice(0, BUFFER_MAX)
      const body = JSON.stringify(batch)
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' })
        navigator.sendBeacon(endpoint, blob)
      } else {
        void fetch(endpoint, {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' },
          keepalive: true,
        })
      }
    }

    const currentPath = path || window.location.pathname + window.location.search

    const track = (event: EventName, extra?: { slug?: string; payload?: Record<string, unknown>; path?: string }) => {
      buffer.push({
        visitor_id: vid,
        session_id: sid,
        event,
        path: extra?.path ?? currentPath,
        referrer: document.referrer || '',
        payload: extra?.slug ? { slug: extra.slug, ...extra.payload } : extra?.payload,
      })
      if (buffer.length >= BUFFER_MAX) flush()
    }

    track('page_view')

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-analytics]') as HTMLElement | null
      if (!el) return
      const name = el.getAttribute('data-analytics') as EventName | null
      const slug = el.getAttribute('data-slug') ?? undefined
      if (name === 'card_expand' || name === 'website_click' || name === 'filter_apply' || name === 'search' || name === 'claim_open') {
        track(name, { slug })
      }
    }
    document.addEventListener('click', onClick)

    const io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const slug = (entry.target as HTMLElement).dataset.cardSlug
                if (!slug || viewed.has(slug)) continue
                viewed.add(slug)
                track('card_view', { slug })
              }
            },
            { threshold: 0.6 },
          )
        : null
    document.querySelectorAll<HTMLElement>('[data-card-slug]').forEach((n) => io?.observe(n))

    const enhanceForm = (form: HTMLFormElement, openEvent: EventName, submitEvent: EventName) => {
      let opened = false
      form.addEventListener('focusin', () => {
        if (opened) return
        opened = true
        track(openEvent)
      })
      form.addEventListener('submit', (ev) => {
        const fd = new FormData(form)
        if (String(fd.get('fax') ?? '')) {
          ev.preventDefault()
          return
        }
        const endpointForm = form.getAttribute('data-api') || form.action
        if (!endpointForm) return
        ev.preventDefault()
        const payload: Record<string, string> = {}
        fd.forEach((value, key) => {
          if (key === 'fax') return
          payload[key] = String(value)
        })
        void fetch(endpointForm, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(async (res) => {
            track(submitEvent)
            const box = document.createElement('p')
            box.className = 'form-ok'
            box.textContent = res.ok
              ? 'Заявка отправлена. Оператор свяжется с вами.'
              : 'Не удалось отправить. Попробуйте ещё раз или напишите позже.'
            form.replaceWith(box)
          })
          .catch(() => {
            form.submit()
          })
      })
    }

    document.querySelectorAll<HTMLFormElement>('form[data-analytics="request"]').forEach((f) => enhanceForm(f, 'request_form_open', 'request_submit'))
    document.querySelectorAll<HTMLFormElement>('form[data-analytics="claim"]').forEach((f) => enhanceForm(f, 'claim_open', 'claim_submit'))

    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })

    return () => {
      flush()
      document.removeEventListener('click', onClick)
      io?.disconnect()
      window.removeEventListener('pagehide', onHide)
    }
  }, [apiUrl, path])

  return null
}
