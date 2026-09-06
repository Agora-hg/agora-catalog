import { closeDb } from '@agora/db'
import { formatStats, runImport } from './run.ts'

function parseArgs(argv: string[]): { file?: string; batch?: string } {
  const out: { file?: string; batch?: string } = {}
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg.startsWith('--file=')) {
      out.file = arg.slice('--file='.length)
    } else if (arg === '--file' && next && !next.startsWith('--')) {
      out.file = next
      i++
    } else if (arg.startsWith('--batch=')) {
      out.batch = arg.slice('--batch='.length)
    } else if (arg === '--batch' && next && !next.startsWith('--')) {
      out.batch = next
      i++
    } else if (arg !== '--' && !arg.startsWith('-')) {
      positional.push(arg)
    }
  }
  // `npm run -- --file x` promotes the flag to npm_config_file and strips argv
  const npmFile = process.env.npm_config_file
  const npmBatch = process.env.npm_config_batch
  if (npmFile && npmFile !== 'true') out.file ??= npmFile
  if (npmBatch && npmBatch !== 'true') out.batch ??= npmBatch
  out.file ??= positional[0]
  out.batch ??= positional[1]
  return out
}

const args = parseArgs(process.argv.slice(2))
if (!args.file || !args.batch) {
  process.stderr.write('usage: npm run import -- --file <jsonl> --batch <name>\n')
  process.exit(1)
}

const stats = await runImport({
  file: args.file,
  batch: args.batch,
})
process.stdout.write(formatStats(stats, { file: args.file, batch: args.batch }))

// Соединение закрывает точка входа, а не runImport: он библиотечный
// и вызывается из тестов, которые после него продолжают читать базу.
await closeDb()
