import { resolve } from 'node:path'
import { and, asc, eq, isNull, notExists, or, sql } from 'drizzle-orm'
import { companies, companySources, createDb } from '@agora/db'
import { createDaDataClient, createFixtureClient, withQuota } from './client.ts'
import { enrichCompany } from './dadata.ts'
import { DailyLimitError, DailyQuota, FileQuotaStore } from './quota.ts'
import type { DaDataClient, EnrichStats, SuggestPartyResponse } from './types.ts'

export type RunEnrichOpts = {
  databaseUrl: string
  limit: number
  client?: DaDataClient
  token?: string
  quota?: DailyQuota
  quotaPath?: string
  fetch?: typeof fetch
}

function emptyStats(quota: DailyQuota, quotaUsed: number, quotaRemaining: number): EnrichStats {
  return {
    queued: 0,
    matched: 0,
    needsReview: 0,
    notFound: 0,
    skippedCached: 0,
    skippedNoName: 0,
    apiCalls: 0,
    quotaUsed,
    quotaRemaining,
    quotaLimit: quota.limit,
    stopped: null,
  }
}

export async function loadQueue(
  db: ReturnType<typeof createDb>['db'],
  limit: number,
): Promise<Array<{ id: string; name: string; city: string | null }>> {
  const cached = db
    .select({ one: sql`1` })
    .from(companySources)
    .where(and(eq(companySources.companyId, companies.id), eq(companySources.sourceType, 'dadata')))

  return db
    .select({
      id: companies.id,
      name: companies.name,
      city: companies.city,
    })
    .from(companies)
    .where(
      and(
        or(isNull(companies.inn), eq(companies.inn, '')),
        sql`btrim(${companies.name}) <> ''`,
        eq(companies.isDeleted, false),
        notExists(cached),
      ),
    )
    .orderBy(asc(companies.createdAt), asc(companies.name))
    .limit(limit)
}

export async function runEnrich(opts: RunEnrichOpts): Promise<EnrichStats> {
  const quota =
    opts.quota ?? new DailyQuota(new FileQuotaStore(opts.quotaPath ?? defaultQuotaPath()))

  if (!opts.client && !opts.token) {
    throw new Error('DADATA_TOKEN is not set. Live DaData calls are disabled (ждёт доступ).')
  }

  const client: DaDataClient = opts.client
    ? withQuota(opts.client, quota)
    : createDaDataClient({
        token: opts.token ?? '',
        fetch: opts.fetch,
        quota,
      })

  const { db, pool } = createDb(opts.databaseUrl)
  const stats = emptyStats(quota, await quota.used(), await quota.remaining())

  try {
    if (stats.quotaRemaining <= 0) {
      stats.stopped = 'daily_limit'
      return stats
    }

    const queue = await loadQueue(db, opts.limit)
    stats.queued = queue.length

    for (const company of queue) {
      try {
        const result = await enrichCompany(db, client, company)
        if (result.outcome !== 'skipped_cached' && result.outcome !== 'skipped_no_name') {
          stats.apiCalls += 1
        }
        if (result.outcome === 'accepted') stats.matched += 1
        else if (result.outcome === 'needs_review') stats.needsReview += 1
        else if (result.outcome === 'not_found') stats.notFound += 1
        else if (result.outcome === 'skipped_cached') stats.skippedCached += 1
        else if (result.outcome === 'skipped_no_name') stats.skippedNoName += 1
      } catch (err) {
        if (err instanceof DailyLimitError) {
          stats.stopped = 'daily_limit'
          break
        }
        throw err
      }
    }

    stats.quotaUsed = await quota.used()
    stats.quotaRemaining = await quota.remaining()
    return stats
  } finally {
    await pool.end()
  }
}

export function formatStats(stats: EnrichStats): string {
  const lines = [
    `queued: ${stats.queued}`,
    `matched: ${stats.matched}`,
    `needs_review: ${stats.needsReview}`,
    `not_found: ${stats.notFound}`,
    `skipped_cached: ${stats.skippedCached}`,
    `api_calls: ${stats.apiCalls}`,
    `quota_used: ${stats.quotaUsed}/${stats.quotaLimit}`,
    `quota_remaining: ${stats.quotaRemaining}`,
    stats.stopped === 'daily_limit'
      ? `stopped: дневной лимит ${stats.quotaLimit} исчерпан. Продолжим завтра.`
      : 'stopped: no',
  ]
  return lines.join('\n') + '\n'
}

export function defaultQuotaPath(): string {
  return resolve(process.cwd(), 'data/dadata-quota.json')
}

export { createFixtureClient }
export type { SuggestPartyResponse }
