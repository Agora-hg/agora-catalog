import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { closeDb, companies, companySources, getDb, rawYandexOrgs } from '@agora/db'
import { runImport } from '../src/import/run.ts'
import { openTestDb, resetDb } from './helpers.ts'

const dir = dirname(fileURLToPath(import.meta.url))
const fixture20 = join(dir, 'fixtures/batch-20.jsonl')
const fixtureOne = join(dir, 'fixtures/batch-one.jsonl')

describe('importer on 20-row fixture', { timeout: 60_000, concurrency: 1 }, () => {
  let client: Awaited<ReturnType<typeof openTestDb>>

  before(async () => {
    client = await openTestDb()
    await resetDb(client)
  })

  after(async () => {
    await client.pool.end()
  })

  it('dedups 20 rows into 13 companies and fills staging', async () => {
    const stats = await runImport({ file: fixture20, batch: 'fixture-20' })
    assert.equal(stats.ingested, 20)
    assert.equal(stats.created, 13)
    assert.equal(stats.updated, 7)
    assert.equal(stats.errors, 0)
    assert.equal(stats.companiesTotal, 13)
    assert.equal(stats.withoutCategory, 1)

    const [rawCount] = await client.db
      .select({ n: sql<number>`count(*)::int` })
      .from(rawYandexOrgs)
    assert.equal(rawCount?.n, 20)

    const rows = await client.db.select().from(companies)
    assert.equal(rows.length, 13)
    assert.ok(rows.every((c) => c.status === 'active'))
    assert.ok(rows.every((c) => c.description === null))
    assert.ok(rows.every((c) => c.isDeleted === false))
    assert.equal(rows.filter((c) => c.status === 'inactive').length, 0)

    const inns = rows.map((c) => c.inn).filter((x): x is string => Boolean(x))
    assert.equal(new Set(inns).size, inns.length)
    assert.ok(inns.includes('7701234567'))
    assert.ok(inns.includes('7702345678'))
    assert.ok(inns.includes('7703456789'))
    assert.ok(inns.includes('7704567890'))
    assert.equal(rows.filter((c) => c.inn === '7701234567').length, 1)
    assert.equal(rows.filter((c) => c.inn === '7702345678').length, 1)
    assert.equal(rows.filter((c) => c.inn === '7703456789').length, 1)

    const domains = rows
      .map((c) => c.website)
      .filter((w): w is string => Boolean(w))
      .map((w) => new URL(w).hostname.replace(/^www\./, ''))
    assert.equal(domains.filter((d) => d === 'bubblepack.ru').length, 1)
    assert.equal(domains.filter((d) => d === 'tapeworld.ru' || d === 'www.tapeworld.ru').length, 1)

    const paket = rows.filter((c) => c.name.toLowerCase().replace(/ё/g, 'е') === 'пакетмаркет')
    assert.equal(paket.length, 1)
    assert.equal(paket[0]?.phone, '+74951234567')

    const korobkin = rows.filter((c) => c.name === 'Коробкин')
    assert.equal(korobkin.length, 1)
    assert.equal(korobkin[0]?.phone, '+74959876543')

    const noContacts = rows.find((c) => c.name === 'Упаковка без контактов')
    assert.ok(noContacts)
    assert.equal(noContacts.phone, null)
    assert.equal(noContacts.website, null)
    assert.equal(noContacts.inn, null)

    const alina = rows.find((c) => c.inn === '7701234567')
    assert.ok(alina)
    assert.equal(alina.website, 'https://alina-pack.com')
    assert.ok(alina.productsTags?.some((t) => /гофрокороб/i.test(t)))
    assert.equal(alina.address?.startsWith('Москва'), false)
    assert.equal(alina.city, 'Москва')
    assert.equal(alina.region, 'Москва')
    assert.ok(alina.descriptionRaw)
    assert.equal(alina.yandexOid, '1001')

    const [sources] = await client.db
      .select({ n: sql<number>`count(*)::int` })
      .from(companySources)
    assert.equal(sources?.n, 20)
  })

  it('re-running the same file does not create companies', async () => {
    const [before] = await client.db
      .select({ n: sql<number>`count(*)::int` })
      .from(companies)
    const beforeN = before?.n ?? 0

    const stats = await runImport({ file: fixture20, batch: 'fixture-20' })
    assert.equal(stats.created, 0)
    assert.equal(stats.errors, 0)

    const [after] = await client.db
      .select({ n: sql<number>`count(*)::int` })
      .from(companies)
    assert.equal(after?.n, beforeN)
    assert.equal(after?.n, 13)

    const [rawCount] = await client.db
      .select({ n: sql<number>`count(*)::int` })
      .from(rawYandexOrgs)
    assert.equal(rawCount?.n, 20)

    const still = await client.db.select().from(companies)
    assert.ok(still.every((c) => c.description === null || typeof c.description === 'string'))
    const alina = still.find((c) => c.inn === '7701234567')
    assert.equal(alina && alina.description, null)
  })

  it('does not overwrite a handmade description on update', async () => {
    const alina = await client.db
      .select()
      .from(companies)
      .where(eq(companies.inn, '7701234567'))
      .limit(1)
    assert.ok(alina[0])
    await client.db
      .update(companies)
      .set({ description: 'наш текст' })
      .where(eq(companies.id, alina[0].id))

    await runImport({ file: fixture20, batch: 'fixture-20' })

    const again = await client.db
      .select()
      .from(companies)
      .where(eq(companies.inn, '7701234567'))
      .limit(1)
    assert.equal(again[0]?.description, 'наш текст')
  })

  it('marks companies missing from a new run as unknown, never inactive', async () => {
    const stats = await runImport({ file: fixtureOne, batch: 'fixture-one' })
    assert.equal(stats.created, 0)
    assert.equal(stats.markedUnknown, 12)

    const rows = await client.db.select().from(companies)
    const active = rows.filter((c) => c.status === 'active')
    const unknown = rows.filter((c) => c.status === 'unknown')
    const inactive = rows.filter((c) => c.status === 'inactive')
    assert.equal(rows.length, 13)
    assert.equal(active.length, 1)
    assert.equal(unknown.length, 12)
    assert.equal(inactive.length, 0)
    assert.equal(active[0]?.yandexOid, '1001')
    assert.ok(rows.every((c) => c.isDeleted === false))
  })
})
