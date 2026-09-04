import { createDb } from '@agora/db'
import { buildApp } from './app.js'
import { envBool, envString } from './env.js'
import { runRetention } from './events/retention.js'

const databaseUrl = envString('DATABASE_URL')
const { db, pool } = createDb(databaseUrl)
const app = await buildApp({
  db,
  ipHashSalt: envString('IP_HASH_SALT'),
  sessionSecret: envString('SESSION_SECRET'),
  cookieSecure: envBool('COOKIE_SECURE', false),
  logger: true,
  fixture: process.env.NODE_ENV !== 'production',
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

const DAY_MS = 24 * 60 * 60 * 1000
const tickRetention = () => {
  runRetention(db).catch((err: unknown) => {
    app.log.error(err, 'retention failed')
  })
}
setTimeout(tickRetention, 15_000)
setInterval(tickRetention, DAY_MS)

await app.listen({ port, host })
app.log.info(`api http://${host}:${port}`)
