import { createDb } from '@agora/db'
import { buildApp } from './app.ts'
import { envBool, envInt, envString, envStringOpt } from './env.ts'
import { MailQueue } from './mail/queue.ts'
import { UnconfiguredTransport } from './mail/mock.ts'
import { createSmtpTransport, smtpFromEnv } from './mail/smtp.ts'
import { RateLimiter } from './antispam.ts'

const databaseUrl = envString('DATABASE_URL')
const { db, pool } = createDb(databaseUrl)

const smtp = smtpFromEnv()
const transport = smtp ? createSmtpTransport(smtp) : new UnconfiguredTransport()
const mailQueue = new MailQueue(transport, envStringOpt('MAIL_QUEUE_DIR') || undefined)
await mailQueue.init()
mailQueue.start(10_000)

const app = await buildApp({
  db,
  sessionSecret: envString('SESSION_SECRET'),
  cookieSecure: envBool('COOKIE_SECURE', false),
  logger: true,
  mailQueue,
  operatorEmail: envStringOpt('OPERATOR_EMAIL', 'stanis.rum@gmail.com') || 'stanis.rum@gmail.com',
  formMinFillMs: envInt('FORM_MIN_FILL_MS', 3000),
  rateLimiter: new RateLimiter(envInt('REQUEST_RATE_WINDOW_MS', 600_000), envInt('REQUEST_RATE_MAX', 5)),
})

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'

const close = async () => {
  mailQueue.stop()
  await app.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)

await app.listen({ port, host })
app.log.info(`api http://${host}:${port}${smtp ? '' : ' (SMTP не настроен, письма в очереди)'}`)
