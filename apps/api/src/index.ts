import './load-env.js'
import { buildApp } from './app.js'
import { createDb, createPool } from './db.js'

const pool = createPool()
const db = createDb(pool)
const app = await buildApp(db)

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'

await app.listen({ port, host })
process.stdout.write(`api listening on http://${host}:${port}\n`)
