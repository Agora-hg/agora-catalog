import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { createDb } from '@agora/db'
import { ingestJsonl } from './ingest.ts'
import { processBatch } from './process.ts'
import type { ImportStats } from './types.ts'

export type RunImportOpts = {
  file: string
  batch: string
  databaseUrl: string
}

export async function runImport(opts: RunImportOpts): Promise<ImportStats> {
  const file = resolve(opts.file)
  if (!existsSync(file)) {
    throw new Error(`JSONL file not found: ${file}`)
  }
  if (!opts.batch.trim()) {
    throw new Error('--batch is required')
  }

  const { db, pool } = createDb(opts.databaseUrl)
  try {
    const ingested = await ingestJsonl(db, file, opts.batch)
    const processed = await processBatch(db, opts.batch)
    return { ingested: ingested.ingested, ...processed }
  } finally {
    await pool.end()
  }
}

export function formatStats(stats: ImportStats, extra?: { file: string; batch: string }): string {
  const lines = [
    extra ? `file: ${extra.file}` : null,
    extra ? `batch: ${extra.batch}` : null,
    `ingested: ${stats.ingested}`,
    `created: ${stats.created}`,
    `updated: ${stats.updated}`,
    `errors: ${stats.errors}`,
    `without_category: ${stats.withoutCategory}`,
    `marked_unknown: ${stats.markedUnknown}`,
    `companies_total: ${stats.companiesTotal}`,
  ].filter(Boolean)
  return lines.join('\n') + '\n'
}
