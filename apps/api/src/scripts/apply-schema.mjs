// PG 18: generated tsvector через to_tsvector() не проходит
// (выражение не IMMUTABLE). Колонку кладём обычным tsvector.
import fs from 'node:fs'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL')

const parsed = new URL(url)
const dbName = parsed.pathname.replace(/^\//, '')
const adminUrl = new URL(url)
adminUrl.pathname = '/postgres'

let sql = fs.readFileSync(new URL('../../../../packages/db/migrations/0000_init.sql', import.meta.url), 'utf8')
sql = sql.replace(
  '"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector(\'russian\', coalesce(name,\'\') || \' \' || coalesce(description,\'\') || \' \' || coalesce(array_to_string(products_tags, \' \'), \'\'))) STORED',
  '"search_vector" tsvector',
)
sql = sql.replace(/--> statement-breakpoint/g, '')

const admin = new pg.Client({ connectionString: adminUrl.toString() })
await admin.connect()
await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
await admin.query(`CREATE DATABASE ${dbName}`)
await admin.end()

const db = new pg.Client({ connectionString: url })
await db.connect()
await db.query(sql)
await db.end()
console.log(`schema applied to ${dbName}`)
