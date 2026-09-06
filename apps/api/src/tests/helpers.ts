import { adminUsers, closeDb, companies, type Db, getDb } from '@agora/db'
import { sql } from 'drizzle-orm'
import { buildApp } from '../app.ts'
import { hashPassword } from '../auth.ts'
import { RateLimiter } from '../antispam.ts'
import { envString } from '../env.ts'
import { MailQueue } from '../mail/queue.ts'
import { MockTransport } from '../mail/mock.ts'

export const ADMIN_EMAIL = 'operator@agora.local'
export const ADMIN_PASSWORD = 'operator'

export async function openTestDb() {
  return { db: await getDb(), pool: { end: closeDb } }
}

export async function resetDb(db: Db) {
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
      admin_users
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

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return list
    .map((item) => String(item).split(';')[0])
    .filter(Boolean)
    .join('; ')
}

export async function buildTestApp(db: Db, transport = new MockTransport()) {
  const mailQueue = new MailQueue(transport)
  const limiter = new RateLimiter(60_000, 8)
  const app = await buildApp({
    db,
    sessionSecret: 'test-session-secret-010',
    cookieSecure: false,
    logger: false,
    mailQueue,
    operatorEmail: 'stanis.rum@gmail.com',
    formMinFillMs: 3000,
    rateLimiter: limiter,
  })
  return { app, mailQueue, transport, limiter }
}

export async function loginCookie(app: Awaited<ReturnType<typeof buildTestApp>>['app']): Promise<string> {
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

export function oldForm(): { form_started_at: number } {
  return { form_started_at: Date.now() - 10_000 }
}
