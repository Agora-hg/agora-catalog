import { sql } from 'drizzle-orm'
import { createDb, loadEnv, seedCategories, type DbClient } from '@agora/db'

export function testDatabaseUrl(): string {
  loadEnv()
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required')
  return url
}

export async function openTestDb(): Promise<DbClient> {
  return createDb(testDatabaseUrl())
}

export async function resetDb(client: DbClient): Promise<void> {
  await client.db.execute(sql`
    truncate table
      company_categories,
      company_sources,
      raw_yandex_orgs,
      companies,
      categories
    restart identity cascade
  `)
  await seedCategories(client.db)
}
