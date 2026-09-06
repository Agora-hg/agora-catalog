import { sql } from 'drizzle-orm'
import { closeDb, getDb, seedCategories, type Db } from '@agora/db'

export type TestClient = { db: Db; pool: { end: () => Promise<void> } }

/**
 * Подключение к тестовой базе.
 *
 * Раньше здесь требовался TEST_DATABASE_URL или DATABASE_URL и поднимался свой пул
 * node-postgres. После сборки подключение одно — getDb() из @agora/db: в dev это
 * PGlite (живой Postgres поставить на машине владельца нельзя), на сервере обычный
 * Postgres по DATABASE_URL. Поэтому переменная больше не обязательна.
 */
export async function openTestDb(): Promise<TestClient> {
  return { db: await getDb(), pool: { end: closeDb } }
}

export async function resetDb(client: TestClient): Promise<void> {
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
