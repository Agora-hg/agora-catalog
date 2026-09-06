import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { companies, companySources } from '@agora/db'
import { createFixtureClient } from '../src/enrich/client.ts'
import { enrichCompany } from '../src/enrich/dadata.ts'
import { DailyQuota, MemoryQuotaStore } from '../src/enrich/quota.ts'
import { formatStats, runEnrich } from '../src/enrich/run.ts'
import type { SuggestPartyRequest } from '../src/enrich/types.ts'
import { insertCompany, loadPartyFixture, openTestDb, party, resetDb } from './helpers.ts'

const fx = loadPartyFixture()

describe('enrichCompany + runEnrich on fixtures', { timeout: 60_000, concurrency: 1 }, () => {
  let client: Awaited<ReturnType<typeof openTestDb>>

  before(async () => {
    client = await openTestDb()
    await resetDb(client)
  })

  after(async () => {
    await client.pool.end()
  })

  it('writes inn/ogrn/kpp/okved/legal_name/egrul_status only on exact active match', async () => {
    await resetDb(client)
    const calls: SuggestPartyRequest[] = []
    const api = createFixtureClient(fx, (req) => calls.push(req))

    const exact = await insertCompany(client, { name: 'ООО АлинаПак', slug: 'alinapak' })
    const trade = await insertCompany(client, { name: 'ПакМастер', slug: 'pakmaster' })
    const dead = await insertCompany(client, { name: 'ООО МёртваяТара', slug: 'dead' })
    const kazan = await insertCompany(client, { name: 'ООО КазаньПак', slug: 'kazan' })
    const twins = await insertCompany(client, { name: 'ООО ДваБлизнеца', slug: 'twins' })
    const missing = await insertCompany(client, { name: 'НетВЕгрюл', slug: 'missing' })
    const reorg = await insertCompany(client, { name: 'ООО Реорганизуемый', slug: 'reorg' })
    await insertCompany(client, { name: 'УжеСИнн', slug: 'has-inn', inn: '7711111111' })

    const stats = await runEnrich({
      limit: 50,
      client: api,
      quota: new DailyQuota(new MemoryQuotaStore(0), 10_000),
    })

    assert.equal(stats.queued, 7)
    assert.equal(stats.matched, 2)
    assert.equal(stats.needsReview, 4)
    assert.equal(stats.notFound, 1)
    assert.equal(stats.stopped, null)
    assert.equal(calls.length, 7)

    const rows = await client.db.select().from(companies)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

    assert.equal(byId[exact.id]?.inn, '7701234567')
    assert.equal(byId[exact.id]?.ogrn, '1027700000001')
    assert.equal(byId[exact.id]?.kpp, '770101001')
    assert.equal(byId[exact.id]?.okved, '17.21')
    assert.equal(byId[exact.id]?.legalName, 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ АЛИНАПАК')
    assert.equal(byId[exact.id]?.egrulStatus, 'ACTIVE')
    assert.equal(byId[exact.id]?.name, 'ООО АлинаПак')

    assert.equal(byId[reorg.id]?.inn, '7705555555')
    assert.equal(byId[reorg.id]?.egrulStatus, 'REORGANIZING')

    assert.equal(byId[trade.id]?.inn, null)
    assert.equal(byId[trade.id]?.egrulStatus, null)
    assert.equal(byId[dead.id]?.inn, null)
    assert.equal(byId[dead.id]?.egrulStatus, null)
    assert.equal(byId[kazan.id]?.inn, null)
    assert.equal(byId[twins.id]?.inn, null)
    assert.equal(byId[missing.id]?.inn, null)

    const sources = await client.db.select().from(companySources)
    assert.equal(sources.length, 7)
    assert.ok(sources.every((s) => s.sourceType === 'dadata'))

    const tradeSrc = sources.find((s) => s.companyId === trade.id)
    const tradePayload = tradeSrc?.payload as { needsReview?: boolean; status?: string; acceptedInn?: string | null }
    assert.equal(tradePayload.needsReview, true)
    assert.equal(tradePayload.status, 'needs_review')
    assert.equal(tradePayload.acceptedInn, null)

    const deadSrc = sources.find((s) => s.companyId === dead.id)
    const deadPayload = deadSrc?.payload as {
      needsReview?: boolean
      reason?: string
      suggestions?: Array<{ data?: { state?: { status?: string } } }>
    }
    assert.equal(deadPayload.needsReview, true)
    assert.equal(deadPayload.reason, 'exact_liquidated')
    assert.equal(deadPayload.suggestions?.[0]?.data?.state?.status, 'LIQUIDATED')

    const missingSrc = sources.find((s) => s.companyId === missing.id)
    const missingPayload = missingSrc?.payload as { status?: string; needsReview?: boolean }
    assert.equal(missingPayload.status, 'not_found')
    assert.equal(missingPayload.needsReview, false)

    const inns = rows.map((r) => r.inn).filter((x): x is string => Boolean(x))
    assert.equal(new Set(inns).size, inns.length)
    assert.ok(!inns.includes('7707777777'))
  })

  it('does not call DaData again for a company already in company_sources', async () => {
    const calls: SuggestPartyRequest[] = []
    const api = createFixtureClient(fx, (req) => calls.push(req))
    const stats = await runEnrich({
      limit: 50,
      client: api,
      quota: new DailyQuota(new MemoryQuotaStore(0), 10_000),
    })
    assert.equal(stats.queued, 0)
    assert.equal(calls.length, 0)
  })

  it('stops at the quota counter with a clear message', async () => {
    await resetDb(client)
    await insertCompany(client, { name: 'ООО АлинаПак', slug: 'a' })
    await insertCompany(client, { name: 'ООО Реорганизуемый', slug: 'b' })
    await insertCompany(client, { name: 'НетВЕгрюл', slug: 'c' })

    const quota = new DailyQuota(new MemoryQuotaStore(0), 2)
    const stats = await runEnrich({
      limit: 10,
      client: createFixtureClient(fx),
      quota,
    })

    assert.equal(stats.stopped, 'daily_limit')
    assert.equal(stats.matched + stats.needsReview + stats.notFound, 2)
    assert.equal(await quota.used(), 2)
    const text = formatStats(stats)
    assert.match(text, /дневной лимит 2 исчерпан/)
    const sources = await client.db.select().from(companySources)
    assert.equal(sources.length, 2)
  })

  it('does not write a second company the same INN', async () => {
    await resetDb(client)
    const first = await insertCompany(client, { name: 'ООО АлинаПак', slug: 'first' })
    const second = await insertCompany(client, { name: 'ООО АлинаПак', slug: 'second' })
    await enrichCompany(client.db, createFixtureClient(fx), first)
    await enrichCompany(client.db, createFixtureClient(fx), second)

    const rows = await client.db.select().from(companies)
    const withInn = rows.filter((r) => r.inn === '7701234567')
    assert.equal(withInn.length, 1)
    assert.equal(withInn[0]?.id, first.id)
    const [src] = await client.db
      .select()
      .from(companySources)
      .where(eq(companySources.companyId, second.id))
    const payload = src?.payload as { reason?: string; needsReview?: boolean }
    assert.equal(payload.reason, 'inn_conflict')
    assert.equal(payload.needsReview, true)
  })

  it('runs 100 fixture companies and never assigns a foreign INN', async () => {
    await resetDb(client)
    const fixture: Record<string, { suggestions: ReturnType<typeof party>[] }> = {}
    const expectedInn = new Map<string, string | null>()

    for (let i = 1; i <= 70; i++) {
      const name = `ООО Автомат${String(i).padStart(3, '0')}`
      const inn = String(7700000000 + i)
      fixture[name] = { suggestions: [party({ value: name, inn, status: 'ACTIVE' })] }
      expectedInn.set(name, inn)
      await insertCompany(client, { name, slug: `auto-${i}` })
    }
    for (let i = 1; i <= 15; i++) {
      const name = `ПакМастер${i}`
      const legal = `ООО ПАКМАСТЕР${i}`
      const inn = String(7700001000 + i)
      fixture[name] = { suggestions: [party({ value: legal, inn, status: 'ACTIVE' })] }
      expectedInn.set(name, null)
      await insertCompany(client, { name, slug: `trade-${i}` })
    }
    for (let i = 1; i <= 8; i++) {
      const name = `ООО Ликвидант${i}`
      fixture[name] = {
        suggestions: [party({ value: name, inn: String(7700002000 + i), status: 'LIQUIDATED' })],
      }
      expectedInn.set(name, null)
      await insertCompany(client, { name, slug: `dead-${i}` })
    }
    for (let i = 1; i <= 7; i++) {
      const name = `НетВЕгрюл${i}`
      fixture[name] = { suggestions: [] }
      expectedInn.set(name, null)
      await insertCompany(client, { name, slug: `miss-${i}` })
    }

    const stats = await runEnrich({
      limit: 100,
      client: createFixtureClient(fixture),
      quota: new DailyQuota(new MemoryQuotaStore(0), 10_000),
    })

    assert.equal(stats.queued, 100)
    assert.equal(stats.matched, 70)
    assert.equal(stats.needsReview, 23)
    assert.equal(stats.notFound, 7)

    const rows = await client.db.select().from(companies)
    for (const row of rows) {
      const want = expectedInn.get(row.name)
      assert.equal(row.inn ?? null, want ?? null, `wrong inn for ${row.name}`)
    }
    const auto = rows.filter((r) => r.name.startsWith('ООО Автомат'))
    assert.ok(auto.every((r) => r.egrulStatus === 'ACTIVE'))
    assert.equal(auto.length, 70)
  })
})
