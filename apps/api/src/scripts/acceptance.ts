import { companies, createDb, events } from '@agora/db'
import { sql } from 'drizzle-orm'
import { ingestEvents } from '../events/ingest.js'
import { runRetention } from '../events/retention.js'
import { envString } from '../env.js'

const { db, pool } = createDb(envString('DATABASE_URL'))
const salt = envString('IP_HASH_SALT')

await db.execute(sql`
  truncate table events, company_categories, companies restart identity cascade
`)

const [company] = await db
  .insert(companies)
  .values({ name: 'АлинаПак', slug: 'alinapak', city: 'Москва', status: 'active', website: 'https://alinapak.ru' })
  .returning()

await ingestEvents(
  db,
  [
    { visitor_id: 'v-acc', session_id: 's-acc', event: 'page_view', path: '/', referrer: 'https://yandex.ru/' },
    { visitor_id: 'v-acc', session_id: 's-acc', event: 'card_view', path: '/', payload: { slug: 'alinapak' } },
    { visitor_id: 'v-acc', session_id: 's-acc', event: 'website_click', path: '/', payload: { slug: 'alinapak' } },
  ],
  { ip: '203.0.113.10', userAgent: 'acceptance', salt },
)

process.stdout.write('\n=== SQL 1. визит → карточка → сайт ===\n')
const seq = await db.execute(sql`
  SELECT event, path, company_id, payload, ip_hash, created_at
  FROM events
  ORDER BY created_at, id
`)
console.table(seq.rows)

const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
await db.insert(events).values([
  { visitorId: 'old-v', sessionId: 'old-s', event: 'page_view', path: '/', createdAt: old },
  {
    visitorId: 'old-v',
    sessionId: 'old-s',
    event: 'card_view',
    companyId: company!.id,
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
])

process.stdout.write('\n=== SQL 2. до ретенции: сырые старше 90 дней ===\n')
const before = await db.execute(sql`
  SELECT event, visitor_id, created_at
  FROM events
  WHERE created_at < now() - interval '90 days'
  ORDER BY created_at
`)
console.table(before.rows)

const result = await runRetention(db)
process.stdout.write(
  `\nretention deleted=${result.deleted} aggregates=${result.aggregateRows} cutoff=${result.cutoff.toISOString()}\n`,
)

process.stdout.write('\n=== SQL 3. после ретенции: сырые старше 90 дней (должно быть 0) ===\n')
const afterRaw = await db.execute(sql`
  SELECT count(*)::int AS n FROM events WHERE created_at < now() - interval '90 days'
`)
console.table(afterRaw.rows)

process.stdout.write('\n=== SQL 4. свежие сырые на месте ===\n')
const fresh = await db.execute(sql`
  SELECT event, visitor_id, created_at FROM events ORDER BY created_at, id
`)
console.table(fresh.rows)

process.stdout.write('\n=== SQL 5. суточные агрегаты ===\n')
const agg = await db.execute(sql`
  SELECT day, event, dimension, dimension_value, count, unique_visitors
  FROM event_daily_aggregates
  ORDER BY event, dimension, dimension_value
`)
console.table(agg.rows)

await pool.end()
