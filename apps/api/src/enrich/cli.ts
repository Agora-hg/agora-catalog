import { loadEnv, requireDatabaseUrl } from '@agora/db'
import { DailyQuota, FileQuotaStore } from './quota.ts'
import { defaultQuotaPath, formatStats, runEnrich } from './run.ts'

function parseLimit(argv: string[]): number {
  let limit: number | undefined
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const next = argv[i + 1]
    if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length))
    else if (arg === '--limit' && next && !next.startsWith('--')) {
      limit = Number(next)
      i++
    } else if (arg !== '--' && !arg.startsWith('-')) {
      positional.push(arg)
    }
  }
  const npmLimit = process.env.npm_config_limit
  if (limit === undefined && npmLimit && npmLimit !== 'true') limit = Number(npmLimit)
  if (limit === undefined && positional[0]) limit = Number(positional[0])
  if (limit === undefined) return Number.MAX_SAFE_INTEGER
  if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(limit)) {
    throw new Error('--limit must be a non-negative integer')
  }
  return limit
}

loadEnv()

const limit = parseLimit(process.argv.slice(2))
const token = process.env.DADATA_TOKEN?.trim()
if (!token) {
  process.stderr.write(
    'DADATA_TOKEN is not set. Live DaData calls are disabled (ждёт доступ). Use tests on fixtures.\n',
  )
  process.exit(1)
}

const quota = new DailyQuota(new FileQuotaStore(defaultQuotaPath()))
const stats = await runEnrich({
  databaseUrl: requireDatabaseUrl(),
  limit,
  token,
  quota,
})
process.stdout.write(formatStats(stats))
if (stats.stopped === 'daily_limit' && stats.matched + stats.needsReview + stats.notFound === 0) {
  process.exitCode = 0
}
