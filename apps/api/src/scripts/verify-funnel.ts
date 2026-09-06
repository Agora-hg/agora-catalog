import { closeDb, getDb, requestCompanies, requests } from '@agora/db'
import { count, sql } from 'drizzle-orm'
import { getFunnel } from '../admin/funnel.ts'
import { FUNNEL_EXPECTED, seedFunnelData } from './funnel-fixture.ts'

const db = await getDb()

await db.execute(sql`
  truncate table
    company_categories,
    company_sources,
    company_claims,
    request_companies,
    supplier_responses,
    events,
    raw_yandex_orgs,
    companies,
    requests
  restart identity cascade
`)

await seedFunnelData(db)

const [reqN] = await db.select({ n: count() }).from(requests)
const byStatus = await db
  .select({ status: requestCompanies.status, n: count() })
  .from(requestCompanies)
  .groupBy(requestCompanies.status)

const sqlFunnel = {
  requests: Number(reqN?.n ?? 0),
  contacts: byStatus
    .filter((r) => r.status !== 'selected')
    .reduce((s, r) => s + Number(r.n), 0),
  answered: byStatus
    .filter((r) => r.status === 'interested' || r.status === 'not_interested' || r.status === 'connected')
    .reduce((s, r) => s + Number(r.n), 0),
  interested: byStatus
    .filter((r) => r.status === 'interested' || r.status === 'connected')
    .reduce((s, r) => s + Number(r.n), 0),
  connected: Number(byStatus.find((r) => r.status === 'connected')?.n ?? 0),
}

const apiFunnel = await getFunnel(db)

console.log('request_companies by status:')
for (const row of byStatus) console.log(`  ${row.status}: ${row.n}`)
console.log('SQL funnel:     ', JSON.stringify(sqlFunnel))
console.log('getFunnel():    ', JSON.stringify(apiFunnel))
console.log('expected:       ', JSON.stringify(FUNNEL_EXPECTED))

const ok =
  apiFunnel.requests === FUNNEL_EXPECTED.requests &&
  apiFunnel.contacts === FUNNEL_EXPECTED.contacts &&
  apiFunnel.answered === FUNNEL_EXPECTED.answered &&
  apiFunnel.interested === FUNNEL_EXPECTED.interested &&
  apiFunnel.connected === FUNNEL_EXPECTED.connected &&
  JSON.stringify(apiFunnel) === JSON.stringify(sqlFunnel)

console.log(ok ? 'FUNNEL OK' : 'FUNNEL MISMATCH')
await closeDb()
if (!ok) process.exit(1)
