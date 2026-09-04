import { adminUsers, createDb } from '@agora/db'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth.ts'
import { envString } from '../env.ts'

const { db, pool } = createDb(envString('DATABASE_URL'))
const email = envString('ADMIN_EMAIL').trim().toLowerCase()
const password = envString('ADMIN_PASSWORD')
const passwordHash = await hashPassword(password)
const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1)
if (existing) {
  await db.update(adminUsers).set({ passwordHash, isActive: true, name: 'Оператор' }).where(eq(adminUsers.id, existing.id))
  console.log(`updated admin ${email}`)
} else {
  await db.insert(adminUsers).values({ email, passwordHash, name: 'Оператор', isActive: true })
  console.log(`created admin ${email}`)
}
await pool.end()
