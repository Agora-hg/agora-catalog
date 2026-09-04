import { eq } from 'drizzle-orm'
import { createDb, type Db } from './client.ts'
import { requireDatabaseUrl } from './env.ts'
import { categories } from './schema.ts'
import { CATEGORY_SEED, type CategorySeed } from './seed-categories.ts'

/**
 * Upsert the V0 category tree by slug. Safe to re-run: existing rows keep
 * is_active (operator may have hidden extras in the panel).
 */
export async function seedCategories(db: Db): Promise<{ inserted: number; updated: number }> {
  let inserted = 0
  let updated = 0
  let sort = 0

  async function upsert(node: CategorySeed, parentId: string | null): Promise<string> {
    const sortOrder = sort++
    const existing = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, node.slug))
      .limit(1)

    if (existing[0]) {
      await db
        .update(categories)
        .set({ name: node.name, parentId, sortOrder })
        .where(eq(categories.id, existing[0].id))
      updated++
      return existing[0].id
    }

    const [row] = await db
      .insert(categories)
      .values({
        name: node.name,
        slug: node.slug,
        parentId,
        sortOrder,
        seoTitle: `${node.name} в Москве`,
      })
      .returning({ id: categories.id })
    if (!row) throw new Error(`failed to insert category ${node.slug}`)
    inserted++
    return row.id
  }

  async function walk(nodes: CategorySeed[], parentId: string | null): Promise<void> {
    for (const node of nodes) {
      const id = await upsert(node, parentId)
      if (node.children?.length) await walk(node.children, id)
    }
  }

  await walk(CATEGORY_SEED, null)
  return { inserted, updated }
}

const entry = process.argv[1]?.replaceAll('\\', '/')
if (entry?.endsWith('/seed.ts') || entry?.endsWith('/seed.js')) {
  const url = requireDatabaseUrl()
  const { db, pool } = createDb(url)
  try {
    const stats = await seedCategories(db)
    process.stdout.write(
      `categories seed: inserted=${stats.inserted} updated=${stats.updated}\n`,
    )
  } finally {
    await pool.end()
  }
}
