import { createDb } from '@agora/db'
import { buildApp } from './app.ts'
import { envBool, envString } from './env.ts'

const databaseUrl = envString('DATABASE_URL')
const { db, pool } = createDb(databaseUrl)
const app = await buildApp({
  db,
  sessionSecret: envString('SESSION_SECRET'),
  cookieSecure: envBool('COOKIE_SECURE', false),
  logger: true,
})

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'

const close = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)

await app.listen({ port, host })
app.log.info(`api http://${host}:${port}`)
