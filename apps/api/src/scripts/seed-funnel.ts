import { closeDb, getDb } from '@agora/db'
import { seedFunnelData } from './funnel-fixture.ts'

const db = await getDb()
const result = await seedFunnelData(db)
console.log('seeded funnel fixture')
console.log(JSON.stringify(result.expected, null, 2))
await closeDb()
