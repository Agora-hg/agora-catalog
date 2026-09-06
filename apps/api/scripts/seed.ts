import '../src/load-env.js'
import { seedCategories } from '@agora/db'
import { createDb, createPool } from '../src/db.js'

const pool = createPool()
const db = createDb(pool)
await seedCategories(db)
await pool.end()
console.log('categories seeded')
