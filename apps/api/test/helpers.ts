import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { companies } from '@agora/db'
import type { DaDataSuggestion, SuggestPartyResponse } from '../src/enrich/types.ts'

const dir = dirname(fileURLToPath(import.meta.url))

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


/* ── помощники обогащения ЕГРЮЛ (TASK-007) ──────────────────────────────
   Фича снята решением владельца и нигде не подключена, но код и тесты
   лежат в main, чтобы включить её одним прогоном CLI, когда понадобится. */

export function loadPartyFixture(): Record<string, SuggestPartyResponse> {
  const raw = readFileSync(join(dir, 'fixtures/dadata-party.json'), 'utf8')
  return JSON.parse(raw) as Record<string, SuggestPartyResponse>
}

export function moscowAddress(city = 'Москва') {
  const isMsk = /^г?\.?\s*москва$/i.test(city.trim())
  return {
    value: isMsk ? 'г Москва' : `г ${city}`,
    unrestricted_value: isMsk ? 'г Москва' : `г ${city}`,
    data: isMsk
      ? { city: null, region: 'Москва', region_with_type: 'г Москва', kladr_id: '7700000000000' }
      : { city, region: city, kladr_id: '1600000100000' },
  }
}

export function party(opts: {
  value: string
  inn: string
  status?: string
  city?: string
  ogrn?: string
  kpp?: string
  okved?: string
  full?: string
  branch?: string
}): DaDataSuggestion {
  const value = opts.value
  return {
    value,
    unrestricted_value: value,
    data: {
      inn: opts.inn,
      ogrn: opts.ogrn ?? `102${opts.inn}`,
      kpp: opts.kpp ?? `${opts.inn.slice(0, 4)}01001`,
      okved: opts.okved ?? '17.21',
      branch_type: opts.branch ?? 'MAIN',
      type: 'LEGAL',
      name: {
        short_with_opf: value,
        full_with_opf: opts.full ?? value,
        short: value.replace(/^(ооо|оао|зао|пао|ао|ип)\s+/i, ''),
        full: value.replace(/^(ооо|оао|зао|пао|ао|ип)\s+/i, ''),
      },
      state: { status: opts.status ?? 'ACTIVE' },
      address: moscowAddress(opts.city ?? 'Москва'),
    },
  }
}

let slugSeq = 0

export async function insertCompany(
  client: TestClient,
  values: { name: string; city?: string | null; slug?: string; inn?: string | null },
) {
  const slug = values.slug ?? `c-${Date.now()}-${++slugSeq}`
  const [row] = await client.db
    .insert(companies)
    .values({
      name: values.name,
      slug,
      city: values.city === undefined ? 'Москва' : values.city,
      inn: values.inn ?? null,
      status: 'unknown',
    })
    .returning()
  if (!row) throw new Error('insert company failed')
  return row
}