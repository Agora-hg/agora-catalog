import { categories, type Db } from '@agora/db'
import { asc, eq, isNull } from 'drizzle-orm'
import { AppError } from '../errors.ts'
import { asBool, asString, isUuid } from '../http.ts'
import { slugify } from '../slug.ts'

export async function listCategoryTree(db: Db) {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name))
  const byParent = new Map<string | null, typeof rows>()
  for (const row of rows) {
    const key = row.parentId
    const list = byParent.get(key) ?? []
    list.push(row)
    byParent.set(key, list)
  }
  const roots = byParent.get(null) ?? rows.filter((r) => r.parentId === null)
  return { rows, roots, byParent }
}

export async function createCategory(db: Db, body: Record<string, unknown>) {
  const name = asString(body.name).trim()
  if (!name) throw new AppError(400, 'Название категории обязательно')
  const slug = asString(body.slug).trim() || slugify(name)
  const parentRaw = asString(body.parentId || body.parent_id)
  const parentId = parentRaw && isUuid(parentRaw) ? parentRaw : null
  const sortRaw = asString(body.sortOrder || body.sort_order)
  const sortOrder = sortRaw ? Number(sortRaw) : await nextSort(db, parentId)
  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug,
      parentId,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: body.isActive === undefined && body.is_active === undefined ? true : asBool(body.isActive ?? body.is_active),
      seoTitle: asString(body.seoTitle || body.seo_title).trim() || null,
      seoDescription: asString(body.seoDescription || body.seo_description).trim() || null,
    })
    .returning()
  return row
}

async function nextSort(db: Db, parentId: string | null): Promise<number> {
  const siblings = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId))
    .orderBy(asc(categories.sortOrder))
  const last = siblings[siblings.length - 1]
  return (last?.sortOrder ?? -1) + 1
}

export async function patchCategory(db: Db, id: string, body: Record<string, unknown>) {
  if (!isUuid(id)) throw new AppError(404, 'Категория не найдена')
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
  if (!existing) throw new AppError(404, 'Категория не найдена')

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = asString(body.name).trim()
    if (!name) throw new AppError(400, 'Название категории обязательно')
    patch.name = name
  }
  if (body.slug !== undefined) {
    const slug = asString(body.slug).trim()
    if (!slug) throw new AppError(400, 'slug не может быть пустым')
    patch.slug = slug
  }
  if (body.isActive !== undefined || body.is_active !== undefined) {
    patch.isActive = asBool(body.isActive ?? body.is_active)
  }
  if (body.sortOrder !== undefined || body.sort_order !== undefined) {
    const n = Number(body.sortOrder ?? body.sort_order)
    if (!Number.isFinite(n)) throw new AppError(400, 'sort_order должен быть числом')
    patch.sortOrder = n
  }
  if (body.parentId !== undefined || body.parent_id !== undefined) {
    const raw = asString(body.parentId ?? body.parent_id)
    patch.parentId = raw && isUuid(raw) ? raw : null
  }
  if (body.seoTitle !== undefined || body.seo_title !== undefined) {
    patch.seoTitle = asString(body.seoTitle ?? body.seo_title).trim() || null
  }
  if (body.seoDescription !== undefined || body.seo_description !== undefined) {
    patch.seoDescription = asString(body.seoDescription ?? body.seo_description).trim() || null
  }
  if (Object.keys(patch).length === 0) return existing
  const [updated] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning()
  return updated
}

export async function moveCategory(db: Db, id: string, direction: 'up' | 'down') {
  if (!isUuid(id)) throw new AppError(404, 'Категория не найдена')
  const [current] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
  if (!current) throw new AppError(404, 'Категория не найдена')
  const siblings = await db
    .select()
    .from(categories)
    .where(current.parentId ? eq(categories.parentId, current.parentId) : isNull(categories.parentId))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
  const index = siblings.findIndex((row) => row.id === id)
  const swapWith = direction === 'up' ? siblings[index - 1] : siblings[index + 1]
  if (!swapWith) return current
  await db.update(categories).set({ sortOrder: swapWith.sortOrder }).where(eq(categories.id, current.id))
  await db.update(categories).set({ sortOrder: current.sortOrder }).where(eq(categories.id, swapWith.id))
  const [updated] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
  return updated
}

export function serializeCategory(row: typeof categories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parent_id: row.parentId,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    seo_title: row.seoTitle,
    seo_description: row.seoDescription,
    created_at: row.createdAt.toISOString(),
  }
}
