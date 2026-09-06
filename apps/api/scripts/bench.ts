import '../src/load-env.js'
import { sql } from 'drizzle-orm'
import { categories, companies, companyCategories, seedCategories } from '@agora/db'
import { buildApp } from '../src/app.js'
import { createDb, createPool } from '../src/db.js'

const COUNT = 1000
const pool = createPool()
const db = createDb(pool)

await seedCategories(db)

const [gofro] = await db.select({ id: categories.id }).from(categories).where(sql`${categories.slug} = 'gofrokoroba'`)
if (!gofro) throw new Error('gofrokoroba missing')

await db.execute(sql`truncate table company_sources, company_categories, companies cascade`)

const batchSize = 100
const insertedIds: string[] = []
for (let start = 0; start < COUNT; start += batchSize) {
  const values = Array.from({ length: batchSize }, (_, offset) => {
    const i = start + offset
    return {
      name: `Бенч компания ${String(i).padStart(4, '0')}`,
      slug: `bench-${i}`,
      city: 'Москва',
      address: `Москва, ул. Бенч, ${i}`,
      description: `поставщик упаковки номер ${i}`,
      productsTags: ['гофрокороба'],
      status: 'active' as const,
      isActive: true,
      isVerified: i % 10 === 0,
      isDeleted: false,
    }
  })
  const rows = await db.insert(companies).values(values).returning({ id: companies.id })
  insertedIds.push(...rows.map((row) => row.id))
}

for (let start = 0; start < insertedIds.length; start += batchSize) {
  const slice = insertedIds.slice(start, start + batchSize)
  await db.insert(companyCategories).values(slice.map((companyId) => ({ companyId, categoryId: gofro.id, isAuto: true })))
}

const app = await buildApp(db)
await app.ready()

async function timed(url: string) {
  const started = performance.now()
  const res = await app.inject({ method: 'GET', url })
  const ms = performance.now() - started
  return { ms, status: res.statusCode, bytes: res.body.length, total: (res.json() as { total: number }).total }
}

const urls = ['/v1/companies?city=moskva&per_page=24', '/v1/companies?category=gofrokoroba&per_page=24']

for (const url of urls) {
  const first = await timed(url)
  const second = await timed(url)
  console.log(
    JSON.stringify({
      url,
      first_ms: Number(first.ms.toFixed(1)),
      second_ms: Number(second.ms.toFixed(1)),
      status: first.status,
      total: first.total,
      bytes: first.bytes,
    }),
  )
}

await app.close()
await pool.end()
