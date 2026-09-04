import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { hashIp } from '../src/events/hash.js'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  IP_HASH_SALT,
  buildTestApp,
  cookieFrom,
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

const visitor = 'visitor-test-1'
const session = 'session-test-1'

function event(name: string, extra: Record<string, unknown> = {}) {
  return {
    visitor_id: visitor,
    session_id: session,
    event: name,
    path: extra.path ?? '/',
    referrer: extra.referrer ?? 'https://yandex.ru/search',
    payload: extra.payload,
    company_id: extra.company_id,
    category_id: extra.category_id,
    utm: extra.utm,
  }
}

describe('POST /v1/events', () => {
  it('принимает батч, 204, пишет события в том порядке, IP не хранит', async () => {
    const company = await seedCompany(db, { name: 'АлинаПак', slug: 'alinapak', website: 'https://alinapak.ru' })
    const batch = [
      event('page_view', { path: '/' }),
      event('card_view', { payload: { slug: 'alinapak' } }),
      event('website_click', { payload: { slug: 'alinapak' } }),
    ]
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
        'user-agent': 'Mozilla/5.0 test-agent',
      },
      payload: batch,
    })
    assert.equal(res.statusCode, 204, res.body)
    assert.equal(res.body, '')

    const rows = await listEvents(db)
    assert.equal(rows.length, 3)
    assert.deepEqual(
      rows.map((row) => row.event),
      ['page_view', 'card_view', 'website_click'],
    )
    assert.ok(rows[0]!.createdAt.getTime() <= rows[1]!.createdAt.getTime())
    assert.ok(rows[1]!.createdAt.getTime() <= rows[2]!.createdAt.getTime())
    assert.equal(rows[1]!.companyId, company.id)
    assert.equal(rows[2]!.companyId, company.id)

    const raw = JSON.stringify(rows)
    assert.equal(raw.includes('203.0.113.10'), false)
    for (const row of rows) {
      assert.equal(row.ipHash, hashIp('203.0.113.10', IP_HASH_SALT))
      assert.equal(row.userAgent, 'Mozilla/5.0 test-agent')
      assert.equal(row.visitorId, visitor)
      assert.equal(row.sessionId, session)
    }
  })

  it('принимает text/plain как sendBeacon', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      payload: JSON.stringify([event('page_view', { path: '/category/gofrokoroba' })]),
    })
    assert.equal(res.statusCode, 204, res.body)
    const rows = await listEvents(db)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.path, '/category/gofrokoroba')
  })

  it('отклоняет батч больше 50', async () => {
    const batch = Array.from({ length: 51 }, () => event('page_view'))
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'application/json' },
      payload: batch,
    })
    assert.equal(res.statusCode, 400)
    const rows = await listEvents(db)
    assert.equal(rows.length, 0)
  })

  it('отклоняет неизвестный тип события, если валидных нет', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'application/json' },
      payload: [{ visitor_id: visitor, event: 'hack_attempt', ip: '1.2.3.4' }],
    })
    assert.equal(res.statusCode, 400)
    const rows = await listEvents(db)
    assert.equal(rows.length, 0)
  })

  it('вырезает IP и ПД из payload, несуществующий company_id не пишется', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
      payload: [
        event('search', {
          payload: {
            q: 'фольга пищевая',
            results_count: 0,
            ip: '198.51.100.7',
            email: 'leak@example.com',
          },
          company_id: '00000000-0000-4000-8000-000000000099',
        }),
      ],
    })
    assert.equal(res.statusCode, 204, res.body)
    const rows = await listEvents(db)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.companyId, null)
    const payload = rows[0]!.payload as Record<string, unknown>
    assert.equal(payload.q, 'фольга пищевая')
    assert.equal(payload.results_count, 0)
    assert.equal('ip' in payload, false)
    assert.equal('email' in payload, false)
    const dumped = JSON.stringify(rows)
    assert.equal(dumped.includes('198.51.100.7'), false)
    assert.equal(dumped.includes('leak@example.com'), false)
  })

  it('пустой батч — 204', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'application/json' },
      payload: [],
    })
    assert.equal(res.statusCode, 204)
  })
})

describe('admin analytics', () => {
  it('без сессии JSON 401, HTML редирект на логин', async () => {
    const json = await app.inject({
      method: 'GET',
      url: '/admin/stats/behavior',
      headers: { accept: 'application/json' },
    })
    assert.equal(json.statusCode, 401)

    const html = await app.inject({
      method: 'GET',
      url: '/admin/analytics',
      headers: { accept: 'text/html' },
    })
    assert.equal(html.statusCode, 302)
    assert.equal(html.headers.location, '/admin/login')
  })

  it('логин ставит httpOnly cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    assert.equal(res.statusCode, 200)
    const setCookie = String(res.headers['set-cookie'] ?? '')
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /agora_admin_session/)
    assert.ok(cookieFrom(res))
  })
})
