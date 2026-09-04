import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { events } from '@agora/db'
import { sql } from 'drizzle-orm'
import { runRetention } from '../src/events/retention.js'
import { listEvents, openTestDb, resetDb, seedCompany } from './helpers.js'

const { db, pool } = await openTestDb()

before(async () => {
  await resetDb(db)
})

beforeEach(async () => {
  await resetDb(db)
})

after(async () => {
  await pool.end()
})

describe('ретенция 90 дней', () => {
  it('события 100 дней назад сворачиваются в агрегаты и сырые удаляются', async () => {
    const company = await seedCompany(db, { name: 'АлинаПак', slug: 'alinapak' })
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    const recent = new Date()

    await db.insert(events).values([
      {
        visitorId: 'old-v1',
        sessionId: 'old-s1',
        event: 'page_view',
        path: '/',
        createdAt: old,
      },
      {
        visitorId: 'old-v1',
        sessionId: 'old-s1',
        event: 'card_view',
        companyId: company.id,
        payload: { slug: 'alinapak' },
        createdAt: new Date(old.getTime() + 1000),
      },
      {
        visitorId: 'old-v2',
        sessionId: 'old-s2',
        event: 'search',
        payload: { q: 'фольга пищевая', results_count: 0 },
        createdAt: new Date(old.getTime() + 2000),
      },
      {
        visitorId: 'new-v1',
        sessionId: 'new-s1',
        event: 'page_view',
        path: '/',
        createdAt: recent,
      },
    ])

    const before = await listEvents(db)
    assert.equal(before.length, 4)

    const result = await runRetention(db)
    assert.equal(result.deleted, 3)
    assert.ok(result.aggregateRows >= 1)

    const rawLeft = await listEvents(db)
    assert.equal(rawLeft.length, 1)
    assert.equal(rawLeft[0]!.visitorId, 'new-v1')
    assert.equal(rawLeft[0]!.event, 'page_view')

    const oldRaw = await db.execute(sql`
      SELECT count(*)::int AS n FROM events WHERE created_at < now() - interval '90 days'
    `)
    const oldCount = Number((oldRaw.rows[0] as { n?: number } | undefined)?.n ?? 0)
    assert.equal(oldCount, 0)

    const aggregates = await db.execute(sql`
      SELECT event, dimension, dimension_value, count, unique_visitors
      FROM event_daily_aggregates
      ORDER BY event, dimension, dimension_value
    `)
    const rows = aggregates.rows as {
      event: string
      dimension: string
      dimension_value: string
      count: number
      unique_visitors: number
    }[]

    const page = rows.find((row) => row.event === 'page_view' && row.dimension === '')
    assert.ok(page, `no page_view aggregate in ${JSON.stringify(rows)}`)
    assert.equal(page.count, 1)

    const cards = rows.find((row) => row.event === 'card_view' && row.dimension === '')
    assert.ok(cards)
    assert.equal(cards.count, 1)

    const empty = rows.find((row) => row.dimension === 'q_zero' && row.dimension_value === 'фольга пищевая')
    assert.ok(empty, `no empty-search aggregate in ${JSON.stringify(rows)}`)
    assert.equal(empty.count, 1)

    const search = rows.find((row) => row.dimension === 'q' && row.dimension_value === 'фольга пищевая')
    assert.ok(search)
    assert.equal(search.count, 1)
  })

  it('повторный прогон не трогает свежие события и не падает на пустом хвосте', async () => {
    await db.insert(events).values({
      visitorId: 'fresh',
      sessionId: 'fresh-s',
      event: 'page_view',
      createdAt: new Date(),
    })
    const first = await runRetention(db)
    assert.equal(first.deleted, 0)
    const second = await runRetention(db)
    assert.equal(second.deleted, 0)
    const left = await listEvents(db)
    assert.equal(left.length, 1)
  })
})
