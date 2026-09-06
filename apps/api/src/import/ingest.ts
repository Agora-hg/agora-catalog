import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { eq, sql } from 'drizzle-orm'
import { rawYandexOrgs, type Db } from '@agora/db'
import type { YandexOrgRaw } from './types.ts'

export async function* readJsonl(filePath: string): AsyncGenerator<{
  lineNo: number
  raw: YandexOrgRaw
}> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  let lineNo = 0
  for await (const line of rl) {
    lineNo++
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error(`invalid JSON at ${filePath}:${lineNo}`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`JSONL row is not an object at ${filePath}:${lineNo}`)
    }
    yield { lineNo, raw: parsed as YandexOrgRaw }
  }
}

function scrapedAtOf(raw: YandexOrgRaw): Date | null {
  if (!raw.scraped_at) return null
  const d = new Date(raw.scraped_at)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Stage JSONL into raw_yandex_orgs. Idempotent on (oid, batch): payload is
 * replaced so a corrected file can be re-imported without a new batch name.
 */
export async function ingestJsonl(
  db: Db,
  filePath: string,
  batch: string,
): Promise<{ ingested: number; skipped: number }> {
  let ingested = 0
  let skipped = 0
  const chunk: Array<typeof rawYandexOrgs.$inferInsert> = []

  const flush = async () => {
    if (!chunk.length) return
    await db
      .insert(rawYandexOrgs)
      .values(chunk)
      .onConflictDoUpdate({
        target: [rawYandexOrgs.oid, rawYandexOrgs.batch],
        set: {
          payload: sql`excluded.payload`,
          scrapedAt: sql`excluded.scraped_at`,
          processedAt: sql`NULL`,
          error: sql`NULL`,
        },
      })
    ingested += chunk.length
    chunk.length = 0
  }

  for await (const { raw } of readJsonl(filePath)) {
    const oid = raw.oid?.trim()
    if (!oid) {
      skipped++
      continue
    }
    chunk.push({
      oid,
      payload: raw,
      batch,
      scrapedAt: scrapedAtOf(raw),
    })
    if (chunk.length >= 100) await flush()
  }
  await flush()
  return { ingested, skipped }
}

export async function loadBatch(db: Db, batch: string) {
  return db
    .select()
    .from(rawYandexOrgs)
    .where(eq(rawYandexOrgs.batch, batch))
}

export async function markRawProcessed(
  db: Db,
  id: string,
  companyId: string | null,
  error: string | null,
): Promise<void> {
  await db
    .update(rawYandexOrgs)
    .set({
      processedAt: new Date(),
      companyId,
      error,
    })
    .where(eq(rawYandexOrgs.id, id))
}
