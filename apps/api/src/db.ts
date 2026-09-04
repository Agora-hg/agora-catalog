import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '@agora/db'

export type Db = ReturnType<typeof drizzle<typeof schema>>

export function createPool(url = process.env.DATABASE_URL): pg.Pool {
  if (!url) throw new Error('DATABASE_URL is required')
  return new pg.Pool({ connectionString: url })
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema })
}
