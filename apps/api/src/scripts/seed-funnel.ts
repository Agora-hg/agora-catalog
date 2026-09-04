import { createDb } from '@agora/db'
import { envString } from '../env.ts'
import { seedFunnelData } from './funnel-fixture.ts'

const { db, pool } = createDb(envString('DATABASE_URL'))
const result = await seedFunnelData(db)
console.log('seeded funnel fixture')
console.log(JSON.stringify(result.expected, null, 2))
await pool.end()
