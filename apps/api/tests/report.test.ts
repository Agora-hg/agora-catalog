import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  buildTestApp,
  listEvents,
  loginCookie,
  openTestDb,
  resetDb,
  seedAdmin,
  seedCompany,
} from './helpers.js'

const { db, pool } = await openTestDb()
const app = await buildTestApp(db)

before(async () => {
  await resetDb(db)
})

beforeEach(async () => {
  await resetDb(db)
  await seedAdmin(db)
})

after(async () => {
  await app.close()
  await pool.end()
})

async function postEvents(batch: unknown[]) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { 'content-type': 'application/json' },
    payload: batch,
  })
  assert.equal(res.statusCode, 204, res.body)
}

describe('отчёт и воронка', () => {
  it('открыл каталог, поскроллил, кликнул Сайт — в базе тот порядок', async () => {
    await seedCompany(db, { name: 'АлинаПак', slug: 'alinapak' })
    await seedCompany(db, { name: 'Ниже сгиба', slug: 'below-fold' })

    await postEvents([
      {
        visitor_id: 'v-catalog',
        session_id: 's-catalog',
        event: 'page_view',
        path: '/',
        referrer: 'https://yandex.ru/',
      },
      {
        visitor_id: 'v-catalog',
        session_id: 's-catalog',
        event: 'card_view',
        path: '/',
        payload: { slug: 'alinapak' },
      },
      {
        visitor_id: 'v-catalog',
        session_id: 's-catalog',
        event: 'website_click',
        path: '/',
        payload: { slug: 'alinapak' },
      },
    ])

    const rows = await listEvents(db)
    assert.deepEqual(
      rows.map((row) => ({ event: row.event, slug: (row.payload as { slug?: string } | null)?.slug ?? null })),
      [
        { event: 'page_view', slug: null },
        { event: 'card_view', slug: 'alinapak' },
        { event: 'website_click', slug: 'alinapak' },
      ],
    )
    assert.equal(
      rows.some((row) => row.event === 'card_view' && (row.payload as { slug?: string } | null)?.slug === 'below-fold'),
      false,
    )
  })

  it('пустые поиски отдельно, воронка считает сессии, топ компаний по card_view', async () => {
    const visible = await seedCompany(db, { name: 'АлинаПак', slug: 'alinapak' })
    await seedCompany(db, { name: 'ПакетМаркет', slug: 'paketmarket' })

    await postEvents([
      { visitor_id: 'v1', session_id: 's1', event: 'page_view', path: '/' },
      { visitor_id: 'v1', session_id: 's1', event: 'card_view', payload: { slug: 'alinapak' } },
      { visitor_id: 'v1', session_id: 's1', event: 'card_view', payload: { slug: 'alinapak' } },
      { visitor_id: 'v1', session_id: 's1', event: 'website_click', payload: { slug: 'alinapak' } },
      { visitor_id: 'v2', session_id: 's2', event: 'page_view', path: '/' },
      { visitor_id: 'v2', session_id: 's2', event: 'card_view', payload: { slug: 'paketmarket' } },
      { visitor_id: 'v2', session_id: 's2', event: 'search', payload: { q: 'гофрокороба', results_count: 12 } },
      { visitor_id: 'v3', session_id: 's3', event: 'page_view', path: '/search' },
      { visitor_id: 'v3', session_id: 's3', event: 'search', payload: { q: 'фольга пищевая', results_count: 0 } },
      { visitor_id: 'v3', session_id: 's3', event: 'search', payload: { q: 'фольга пищевая', results_count: 0 } },
      { visitor_id: 'v3', session_id: 's3', event: 'filter_apply', payload: { category: 'gofrokoroba', filter: 'gofrokoroba' } },
      { visitor_id: 'v4', session_id: 's4', event: 'page_view', path: '/' },
      { visitor_id: 'v4', session_id: 's4', event: 'request_form_open', path: '/' },
      { visitor_id: 'v4', session_id: 's4', event: 'request_submit', path: '/' },
    ])

    const cookie = await loginCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats/behavior?days=30',
      headers: { cookie, accept: 'application/json' },
    })
    assert.equal(res.statusCode, 200, res.body)
    const body = JSON.parse(res.body) as {
      funnel: { visits: number; cards: number; website: number; requests: number; converted: number }
      topCompanies: { label: string; count: number }[]
      topSearches: { key: string; count: number }[]
      emptySearches: { key: string; count: number }[]
      topFilters: { key: string; count: number }[]
    }

    assert.equal(body.funnel.visits, 4)
    assert.equal(body.funnel.cards, 2)
    assert.equal(body.funnel.website, 1)
    assert.equal(body.funnel.requests, 1)
    assert.equal(body.funnel.converted, 2)

    assert.equal(body.topCompanies[0]!.label, 'АлинаПак')
    assert.equal(body.topCompanies[0]!.count, 2)
    assert.equal(body.topCompanies[1]!.label, 'ПакетМаркет')

    assert.equal(body.emptySearches[0]!.key, 'фольга пищевая')
    assert.equal(body.emptySearches[0]!.count, 2)
    assert.equal(
      body.emptySearches.some((row) => row.key === 'гофрокороба'),
      false,
    )
    assert.ok(body.topSearches.some((row) => row.key === 'гофрокороба'))
    assert.equal(body.topFilters[0]!.key, 'gofrokoroba')

    const html = await app.inject({
      method: 'GET',
      url: '/admin/analytics',
      headers: { cookie, accept: 'text/html' },
    })
    assert.equal(html.statusCode, 200)
    assert.match(html.body, /Поиски, по которым ничего не нашлось/)
    assert.match(html.body, /фольга пищевая/)
    assert.match(html.body, /АлинаПак/)
    assert.match(html.body, /Воронка/)

    assert.equal(visible.slug, 'alinapak')
  })
})
