process.env.SESSION_SECRET = 'x'.repeat(40)
process.env.IP_HASH_SALT = 'salt'
process.env.OPERATOR_EMAIL = 'op@example.com'
process.env.REQUESTS_EMAIL_TO = 'op@example.com'
const { buildApp } = await import('./src/app.ts')
const { getDb, closeDb } = await import('@agora/db')
const { MailQueue } = await import('./src/mail/queue.ts')
const { UnconfiguredTransport } = await import('./src/mail/mock.ts')
const db = await getDb()
const app = await buildApp({
  db, sessionSecret: 'x'.repeat(40), logger: false,
  mailQueue: new MailQueue(new UnconfiguredTransport()),
  operatorEmail: 'op@example.com', ipHashSalt: 'salt',
})
const res = await app.inject({
  method: 'POST', url: '/v1/requests',
  headers: { 'content-type': 'application/json' },
  payload: { description: 'нужны гофрокороба 400x300x200, 5000 шт', customer_phone: '+79000000000', delivery_city: 'Москва', quantity: '5000 шт' },
})
console.log('код:', res.statusCode)
console.log('тело:', res.body.slice(0, 400))
await app.close(); await closeDb()
