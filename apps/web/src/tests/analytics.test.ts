import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUFFER_KEY,
  SESSION_TTL_MS,
  VISITOR_COOKIE,
  createAnalytics,
  parseUtm,
  type AnalyticsObserver,
  type AnalyticsObserverEntry,
  type CookieStore,
} from '../lib/analytics.js'

function memoryCookies(initial: Record<string, string> = {}): CookieStore & { store: Record<string, string> } {
  const store = { ...initial }
  return {
    store,
    get: (name) => store[name],
    set: (name, value) => {
      store[name] = value
    },
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial }
  return {
    store,
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
  }
}

type FakeEl = HTMLElement & { slug?: string }

function fakeCard(slug: string): FakeEl {
  return {
    slug,
    dataset: { cardSlug: slug },
    getAttribute: (name: string) => (name === 'data-card-slug' ? slug : null),
  } as unknown as FakeEl
}

function fakeDoc(cards: FakeEl[], extras?: { empty?: boolean; countText?: string; q?: string }) {
  return {
    querySelectorAll: (sel: string) => {
      if (sel.includes('data-card-slug')) return cards
      return []
    },
    querySelector: (sel: string) => {
      if (sel.includes('data-results-count')) return null
      if (sel === '.empty') return extras?.empty ? {} : null
      if (sel === '.count') return extras?.countText ? { textContent: extras.countText } : null
      return null
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Document
}

describe('utm', () => {
  it('забирает utm_* из query', () => {
    assert.deepEqual(parseUtm('?utm_source=yandex&utm_medium=organic&q=короба'), {
      source: 'yandex',
      medium: 'organic',
    })
  })
})

describe('visitor / session', () => {
  it('visitor_id живёт в cookie, session обновляется в окне 30 минут и сбрасывается после', () => {
    const cookies = memoryCookies()
    let now = 1_000_000
    const first = createAnalytics({
      apiUrl: 'http://api.test/v1',
      deps: { now: () => now, cookies, randomId: () => 'id-a', send: () => true },
    })
    assert.equal(cookies.store[VISITOR_COOKIE], 'id-a')
    assert.equal(first.sessionId, 'id-a')

    now += SESSION_TTL_MS - 1000
    const same = createAnalytics({
      apiUrl: 'http://api.test/v1',
      deps: { now: () => now, cookies, randomId: () => 'id-b', send: () => true },
    })
    assert.equal(same.visitorId, 'id-a')
    assert.equal(same.sessionId, 'id-a')

    now += SESSION_TTL_MS + 1000
    const next = createAnalytics({
      apiUrl: 'http://api.test/v1',
      deps: { now: () => now, cookies, randomId: () => 'id-c', send: () => true },
    })
    assert.equal(next.visitorId, 'id-a')
    assert.equal(next.sessionId, 'id-c')
  })
})

describe('sendBeacon + буфер', () => {
  it('на уходе со страницы шлёт text/plain и не теряет буфер, если beacon не взял', () => {
    const sent: { url: string; body: string; type: string }[] = []
    const storage = memoryStorage()
    const analytics = createAnalytics({
      apiUrl: 'http://api.test/v1',
      path: '/',
      deps: {
        cookies: memoryCookies(),
        storage,
        randomId: () => 'id-1',
        send: (url, body, type) => {
          sent.push({ url, body, type })
          return true
        },
      },
    })
    analytics.track('page_view')
    analytics.track('website_click', { slug: 'alinapak' })
    analytics.flush()
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.url, 'http://api.test/v1/events')
    assert.equal(sent[0]!.type, 'text/plain')
    const batch = JSON.parse(sent[0]!.body) as { event: string; payload?: { slug?: string } }[]
    assert.deepEqual(
      batch.map((e) => e.event),
      ['page_view', 'website_click'],
    )
    assert.equal(batch[1]!.payload?.slug, 'alinapak')

    const failing = createAnalytics({
      apiUrl: 'http://api.test/v1',
      deps: {
        cookies: memoryCookies(),
        storage: memoryStorage(),
        randomId: () => 'id-2',
        send: () => false,
      },
    })
    failing.track('page_view')
    failing.flush()
    assert.equal(failing.buffer.length, 1)
    assert.equal(failing.buffer[0]!.event, 'page_view')
  })

  it('восстанавливает буфер из sessionStorage', () => {
    const storage = memoryStorage({
      [BUFFER_KEY]: JSON.stringify([
        { visitor_id: 'x', session_id: 'y', event: 'page_view', path: '/', referrer: '' },
      ]),
    })
    const sent: string[] = []
    const analytics = createAnalytics({
      apiUrl: 'http://api.test/v1',
      deps: {
        cookies: memoryCookies(),
        storage,
        randomId: () => 'id-3',
        send: (_url, body) => {
          sent.push(body)
          return true
        },
      },
    })
    analytics.flush()
    const batch = JSON.parse(sent[0]!) as { event: string }[]
    assert.equal(batch[0]!.event, 'page_view')
  })
})

describe('card_view IntersectionObserver', () => {
  it('не стреляет на карточках ниже сгиба, пока ratio < 0.5', () => {
    const visible = fakeCard('alinapak')
    const below = fakeCard('below-fold')
    const cards = [visible, below]
    let callback: ((entries: AnalyticsObserverEntry[]) => void) | undefined
    const observed: Element[] = []
    const observerFactory = (cb: (entries: AnalyticsObserverEntry[]) => void): AnalyticsObserver => {
      callback = cb
      return {
        observe: (el) => {
          observed.push(el)
        },
        unobserve: () => undefined,
        disconnect: () => undefined,
      }
    }

    const analytics = createAnalytics({
      apiUrl: 'http://api.test/v1',
      path: '/',
      deps: {
        cookies: memoryCookies(),
        storage: memoryStorage(),
        randomId: () => 'id-io',
        send: () => true,
        document: fakeDoc(cards),
        observer: observerFactory,
      },
    })
    analytics.observeCards()
    assert.equal(observed.length, 2)

    callback?.([
      { target: visible, isIntersecting: true, intersectionRatio: 0.6 },
      { target: below, isIntersecting: false, intersectionRatio: 0 },
    ])

    assert.deepEqual(
      analytics.buffer.map((e) => [e.event, e.payload?.slug]),
      [['card_view', 'alinapak']],
    )

    callback?.([{ target: below, isIntersecting: true, intersectionRatio: 0.2 }])
    assert.equal(analytics.buffer.length, 1)

    callback?.([{ target: below, isIntersecting: true, intersectionRatio: 0.5 }])
    assert.deepEqual(
      analytics.buffer.map((e) => e.payload?.slug),
      ['alinapak', 'below-fold'],
    )
  })
})

describe('search results_count', () => {
  it('на /search пишет results_count: 0, если пусто', () => {
    const analytics = createAnalytics({
      apiUrl: 'http://api.test/v1',
      deps: {
        cookies: memoryCookies(),
        storage: memoryStorage(),
        randomId: () => 'id-s',
        send: () => true,
        location: { pathname: '/search', search: '?q=фольга+пищевая', href: '/search?q=фольга+пищевая' },
        document: fakeDoc([], { empty: true }),
      },
    })
    analytics.start()
    const search = analytics.buffer.filter((e) => e.event === 'search')
    assert.equal(search.length, 1)
    assert.equal(search[0]!.payload?.q, 'фольга пищевая')
    assert.equal(search[0]!.payload?.results_count, 0)
  })
})
