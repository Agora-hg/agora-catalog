import { MailQueue } from '../src/mail/queue.ts'
import { MockTransport } from '../src/mail/mock.ts'
import '../src/load-env.js'
import { adminUsers, closeDb, companies, events, getDb, type Db } from '@agora/db'
import { sql } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { hashPassword } from '../src/auth.js'
import { ensureAggregatesTable } from '../src/events/retention.js'

export const ADMIN_EMAIL = 'operator@agora.local'
export const ADMIN_PASSWORD = 'operator'
export const IP_HASH_SALT = 'test-ip-hash-salt-011'
export const SESSION_SECRET = 'test-session-secret-011'

export async function openTestDb() {
  return { db: await getDb(), pool: { end: closeDb } }
}

export async function resetDb(db: Db) {
  await ensureAggregatesTable(db)
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
      categories,
      requests,
      admin_users,
      event_daily_aggregates
    restart identity cascade
  `)
}

export async function seedAdmin(db: Db) {
  const [user] = await db
    .insert(adminUsers)
    .values({
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      name: 'Оператор',
      isActive: true,
    })
    .returning()
  return user!
}

export async function seedCompany(
  db: Db,
  values: Partial<typeof companies.$inferInsert> & { name: string; slug: string },
) {
  const [row] = await db
    .insert(companies)
    .values({
      city: 'Москва',
      status: 'active',
      isActive: true,
      isDeleted: false,
      ...values,
    })
    .returning()
  return row!
}

export async function buildTestApp(db: Db) {
  // mailQueue и operatorEmail обязательны с момента сборки: заявки из TASK-010
  // живут в том же приложении. Тестам хватает мок-транспорта.
  const mailQueue = new MailQueue(new MockTransport())
  return buildApp({
    db,
    mailQueue,
    operatorEmail: 'operator@agora.local',
    ipHashSalt: IP_HASH_SALT,
    sessionSecret: SESSION_SECRET,
    cookieSecure: false,
    logger: false,
    fixture: true,
  })
}

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return list
    .map((item) => String(item).split(';')[0])
    .filter(Boolean)
    .join('; ')
}

export async function loginCookie(app: Awaited<ReturnType<typeof buildTestApp>>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  if (res.statusCode !== 200) {
    throw new Error(`login failed ${res.statusCode} ${res.body}`)
  }
  return cookieFrom(res)
}

export async function listEvents(db: Db) {
  return db.select().from(events).orderBy(events.createdAt, events.id)
}
