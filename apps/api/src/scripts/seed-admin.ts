import { adminUsers, createDb } from '@agora/db'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth.js'
import { envString } from '../env.js'

const email = envString('ADMIN_EMAIL').trim().toLowerCase()
const password = envString('ADMIN_PASSWORD')
const { db, pool } = createDb(envString('DATABASE_URL'))

try {
  const passwordHash = await hashPassword(password)
  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1)
  if (existing) {
    await db.update(adminUsers).set({ passwordHash, isActive: true }).where(eq(adminUsers.id, existing.id))
    process.stdout.write(`admin updated: ${email}\n`)
  } else {
    await db.insert(adminUsers).values({ email, passwordHash, name: 'Оператор', isActive: true })
    process.stdout.write(`admin created: ${email}\n`)
  }
} finally {
  await pool.end()
}
