export const EVENT_NAMES = [
  'page_view',
  'card_view',
  'card_expand',
  'website_click',
  'filter_apply',
  'search',
  'request_form_open',
  'request_submit',
  'claim_open',
  'claim_submit',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

export const VISITOR_COOKIE = 'agora_vid'
export const SESSION_COOKIE = 'agora_sid'
export const VISITOR_TTL_SEC = 365 * 24 * 3600
export const SESSION_TTL_MS = 30 * 60 * 1000
export const BUFFER_MAX = 50
export const BUFFER_KEY = 'agora_evt_buf'
export const SEEN_CARDS_KEY = 'agora_card_views'
const LEGACY_VISITOR = 'av'

export type AnalyticsEvent = {
  visitor_id: string
  session_id: string
  event: EventName
  path: string
  referrer: string
  company_id?: string
  category_id?: string
  utm?: Record<string, string>
  payload?: Record<string, unknown>
}

export type TrackExtra = {
  company_id?: string
  category_id?: string
  slug?: string
  path?: string
  payload?: Record<string, unknown>
}

export type CookieStore = {
  get: (name: string) => string | undefined
  set: (name: string, value: string, maxAgeSec: number) => void
}

export type AnalyticsSend = (url: string, body: string, contentType: string) => boolean

export type AnalyticsObserverEntry = {
  target: Element
  isIntersecting: boolean
  intersectionRatio: number
}

export type AnalyticsObserver = {
  observe: (el: Element) => void
  unobserve: (el: Element) => void
  disconnect: () => void
}

export type AnalyticsDeps = {
  now?: () => number
  cookies?: CookieStore
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  send?: AnalyticsSend
  location?: { pathname: string; search: string; href: string }
  referrer?: string
  randomId?: () => string
  observer?: (cb: (entries: AnalyticsObserverEntry[]) => void, opts: { threshold: number }) => AnalyticsObserver
  document?: Document
}

const EVENT_SET = new Set<string>(EVENT_NAMES)

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function defaultCookies(): CookieStore {
  return {
    get(name) {
      if (typeof document === 'undefined') return undefined
      const parts = document.cookie.split(';')
      for (const part of parts) {
        const [k, ...rest] = part.trim().split('=')
        if (k === name) return decodeURIComponent(rest.join('='))
      }
      return undefined
    },
    set(name, value, maxAgeSec) {
      if (typeof document === 'undefined') return
      const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secure}`
    },
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  if (typeof sessionStorage === 'undefined') {
    const mem = new Map<string, string>()
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v)
      },
      removeItem: (k) => {
        mem.delete(k)
      },
    }
  }
  return sessionStorage
}

function defaultSend(): AnalyticsSend {
  return (url, body, contentType) => {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: contentType })
      if (navigator.sendBeacon(url, blob)) return true
    }
    if (typeof fetch === 'function') {
      void fetch(url, {
        method: 'POST',
        body,
        headers: { 'content-type': contentType },
        keepalive: true,
      })
      return true
    }
    return false
  }
}

export function parseUtm(search: string): Record<string, string> | undefined {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const utm: Record<string, string> = {}
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
    const value = params.get(`utm_${key}`)
    if (value) utm[key] = value
  }
  return Object.keys(utm).length ? utm : undefined
}

function readJsonArray(storage: Pick<Storage, 'getItem'>, key: string): unknown[] {
  const raw = storage.getItem(key)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resultsCountFromDom(doc: Document): number | undefined {
  const marked = doc.querySelector<HTMLElement>('[data-results-count], [data-search-total]')
  if (marked) {
    const raw = marked.getAttribute('data-results-count') ?? marked.getAttribute('data-search-total')
    if (raw !== null && raw !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
  }
  if (doc.querySelector('.empty')) return 0
  const count = doc.querySelector('.count')
  if (count) {
    const text = count.textContent ?? ''
    if (/ничего не найдено/i.test(text)) return 0
    const m = text.match(/найдено:\s*(\d+)/i)
    if (m?.[1]) return Number(m[1])
  }
  return undefined
}

export function createAnalytics(opts: {
  apiUrl: string
  path?: string
  deps?: AnalyticsDeps
}) {
  const apiUrl = opts.apiUrl.replace(/\/$/, '')
  const now = opts.deps?.now ?? Date.now
  const cookies = opts.deps?.cookies ?? defaultCookies()
  const storage = opts.deps?.storage ?? defaultStorage()
  const send = opts.deps?.send ?? defaultSend()
  const loc = opts.deps?.location
  const referrer = opts.deps?.referrer ?? (typeof document !== 'undefined' ? document.referrer : '')
  const randomId = opts.deps?.randomId ?? uuid
  const doc = opts.deps?.document ?? (typeof document !== 'undefined' ? document : undefined)

  const buffer: AnalyticsEvent[] = []
  for (const item of readJsonArray(storage, BUFFER_KEY)) {
    if (item && typeof item === 'object' && typeof (item as AnalyticsEvent).event === 'string') {
      buffer.push(item as AnalyticsEvent)
    }
  }

  const persist = () => {
    storage.setItem(BUFFER_KEY, JSON.stringify(buffer))
  }

  const visitorId = (): string => {
    let id = cookies.get(VISITOR_COOKIE) ?? cookies.get(LEGACY_VISITOR)
    if (!id) id = randomId()
    cookies.set(VISITOR_COOKIE, id, VISITOR_TTL_SEC)
    return id
  }

  const sessionId = (): string => {
    const t = now()
    const raw = cookies.get(SESSION_COOKIE)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string; at?: number }
        if (parsed.id && typeof parsed.at === 'number' && t - parsed.at < SESSION_TTL_MS) {
          cookies.set(SESSION_COOKIE, JSON.stringify({ id: parsed.id, at: t }), SESSION_TTL_MS / 1000)
          return parsed.id
        }
      } catch {
        /* новая сессия */
      }
    }
    const id = randomId()
    cookies.set(SESSION_COOKIE, JSON.stringify({ id, at: t }), SESSION_TTL_MS / 1000)
    return id
  }

  const currentPath = (): string => {
    if (opts.path) return opts.path
    if (loc) return loc.pathname + loc.search
    if (typeof location !== 'undefined') return location.pathname + location.search
    return '/'
  }

  const currentSearch = (): string => {
    if (loc) return loc.search
    if (typeof location !== 'undefined') return location.search
    return ''
  }

  const vid = visitorId()
  const sid = sessionId()
  const utm = parseUtm(currentSearch())

  const flush = () => {
    if (buffer.length === 0) return
    const batch = buffer.splice(0, BUFFER_MAX)
    persist()
    const body = JSON.stringify(batch)
    const ok = send(`${apiUrl}/events`, body, 'text/plain')
    if (!ok) {
      buffer.unshift(...batch)
      persist()
    }
  }

  const track = (event: EventName, extra?: TrackExtra) => {
    if (!EVENT_SET.has(event)) return
    const payload: Record<string, unknown> = { ...(extra?.payload ?? {}) }
    if (extra?.slug && payload.slug === undefined) payload.slug = extra.slug
    const item: AnalyticsEvent = {
      visitor_id: vid,
      session_id: sid,
      event,
      path: extra?.path ?? currentPath(),
      referrer: referrer || '',
    }
    if (extra?.company_id) item.company_id = extra.company_id
    if (extra?.category_id) item.category_id = extra.category_id
    if (utm) item.utm = utm
    if (Object.keys(payload).length) item.payload = payload
    buffer.push(item)
    persist()
    if (buffer.length >= BUFFER_MAX) flush()
  }

  const seenCards = new Set<string>(
    readJsonArray(storage, SEEN_CARDS_KEY).filter((v): v is string => typeof v === 'string'),
  )
  const rememberCard = (key: string) => {
    seenCards.add(key)
    storage.setItem(SEEN_CARDS_KEY, JSON.stringify([...seenCards]))
  }

  const observeCards = (root?: ParentNode): (() => void) => {
    const scope = root ?? doc
    if (!scope) return () => undefined
    const nodes = [...scope.querySelectorAll<HTMLElement>('[data-card-slug], [data-company-id]')]
    const makeObserver =
      opts.deps?.observer ??
      ((cb, options) => {
        if (typeof IntersectionObserver === 'undefined') {
          return { observe() {}, unobserve() {}, disconnect() {} }
        }
        const io = new IntersectionObserver(
          (entries) => {
            cb(
              entries.map((entry) => ({
                target: entry.target,
                isIntersecting: entry.isIntersecting,
                intersectionRatio: entry.intersectionRatio,
              })),
            )
          },
          { threshold: options.threshold },
        )
        return io
      })

    const io = makeObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue
        const el = entry.target as HTMLElement
        const slug = el.dataset.cardSlug ?? el.dataset.slug
        const companyId = el.dataset.companyId
        const key = companyId || slug
        if (!key || seenCards.has(key)) continue
        rememberCard(key)
        track('card_view', {
          company_id: companyId,
          slug,
        })
        io.unobserve(el)
      }
    }, { threshold: 0.5 })

    for (const node of nodes) io.observe(node)
    return () => io.disconnect()
  }

  const bindClicks = (root?: ParentNode): (() => void) => {
    const scope = root ?? doc
    if (!scope || typeof (scope as Element).addEventListener !== 'function') return () => undefined
    const target = scope as Element | Document
    const onClick = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-analytics]') as HTMLElement | null
      if (!el) return
      const name = el.getAttribute('data-analytics')
      if (!name || !EVENT_SET.has(name) || name === 'page_view' || name === 'card_view') return
      const slug = el.getAttribute('data-slug') ?? el.dataset.cardSlug
      const companyId = el.getAttribute('data-company-id') ?? undefined
      const payload: Record<string, unknown> = {}
      const filter = el.getAttribute('data-filter') ?? el.getAttribute('data-category')
      if (filter) {
        payload.filter = filter
        payload.category = filter
      }
      if (name === 'filter_apply' && !payload.filter) {
        const href = el.getAttribute('href')
        payload.filter = href || (el.textContent ?? '').trim()
      }
      track(name as EventName, {
        slug: slug ?? undefined,
        company_id: companyId,
        payload: Object.keys(payload).length ? payload : undefined,
      })
    }
    target.addEventListener('click', onClick)
    return () => target.removeEventListener('click', onClick)
  }

  const trackSearchFromPage = () => {
    const params = new URLSearchParams(currentSearch().startsWith('?') ? currentSearch().slice(1) : currentSearch())
    const q = (params.get('q') ?? '').trim()
    if (!q || !doc) return
    const path = currentPath()
    if (!path.startsWith('/search') && !params.has('q')) return
    const results = resultsCountFromDom(doc)
    track('search', { payload: results === undefined ? { q } : { q, results_count: results } })
  }

  const start = (): (() => void) => {
    if (!apiUrl) return () => undefined
    if (buffer.length) flush()
    track('page_view')
    trackSearchFromPage()
    const stopCards = observeCards()
    const stopClicks = bindClicks()
    const onHide = () => flush()
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onHide)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush()
      })
    }
    return () => {
      flush()
      stopCards()
      stopClicks()
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide)
    }
  }

  return {
    track,
    flush,
    observeCards,
    bindClicks,
    start,
    visitorId: vid,
    sessionId: sid,
    buffer,
  }
}

export function startAnalytics(opts: { apiUrl: string; path?: string; deps?: AnalyticsDeps }): () => void {
  return createAnalytics(opts).start()
}
