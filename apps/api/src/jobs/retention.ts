import { closeDb, getDb } from '@agora/db'
import { envString } from '../env.js'
import { runRetention } from '../events/retention.js'

const db = await getDb()
try {
  const result = await runRetention(db)
  process.stdout.write(
    `retention: deleted ${result.deleted} raw events before ${result.cutoff.toISOString()}, aggregates ${result.aggregateRows}\n`,
  )
} finally {
  await closeDb()
}
