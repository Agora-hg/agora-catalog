/**
 * `npm run -w @agora/db setup` — поднять базу с нуля: миграции + категории.
 *
 * Идемпотентно: гоняй сколько хочешь. Миграции ведёт штатный мигратор drizzle
 * (таблица `__drizzle_migrations`), категории — upsert по slug.
 * На PGlite (dev) создаст `.pgdata/`, на реальном Postgres пойдёт по DATABASE_URL.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { closeDb, getDb, isPglite } from './index.js'
import { categories } from './schema.js'
import { CATEGORY_SEED, type CategorySeed } from './seed-categories.js'

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function migrate(db: Awaited<ReturnType<typeof getDb>>) {
  if (isPglite()) {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as never, { migrationsFolder })
  } else {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(db as never, { migrationsFolder })
  }
  const applied = (await db.execute(
    sql`select count(*)::int n from drizzle.__drizzle_migrations`,
  )) as unknown as { rows: { n: number }[] }
  console.log(`  применённых миграций в базе: ${applied.rows[0]?.n ?? 0}`)
}

async function seedCategories(db: Awaited<ReturnType<typeof getDb>>) {
  let inserted = 0
  let existing = 0

  const upsert = async (node: CategorySeed, parentId: string | null, order: number) => {
    const found = await db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.slug} = ${node.slug}`)
      .limit(1)

    let id = found[0]?.id
    if (id) {
      existing++
    } else {
      const rows = await db
        .insert(categories)
        .values({ name: node.name, slug: node.slug, parentId, sortOrder: order })
        .returning({ id: categories.id })
      id = rows[0]!.id
      inserted++
    }

    let childOrder = 0
    for (const child of node.children ?? []) {
      await upsert(child, id, childOrder++)
    }
  }

  let order = 0
  for (const node of CATEGORY_SEED) await upsert(node, null, order++)

  console.log(`  категорий: создано ${inserted}, уже было ${existing}`)
}

const db = await getDb()
console.log(
  process.env.DATABASE_URL?.startsWith('postgres')
    ? 'движок: node-postgres (DATABASE_URL)'
    : 'движок: PGlite, данные в .pgdata/ (ставить ничего не нужно)',
)
console.log('миграции:')
await migrate(db)
console.log('сиды:')
await seedCategories(db)
await closeDb()
console.log('готово')
