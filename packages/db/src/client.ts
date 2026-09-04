import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.ts'

export type Db = NodePgDatabase<typeof schema>
export type DbClient = { db: Db; pool: Pool }

export function createDb(url: string): DbClient {
  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })
  return { db, pool }
}
