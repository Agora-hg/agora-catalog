import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(here, '../../../.env'),
  resolve(here, '../../.env'),
]

for (const path of candidates) {
  if (existsSync(path)) {
    process.loadEnvFile(path)
    break
  }
}
