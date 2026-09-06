import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
  const here = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(here, '../../.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('DATABASE_URL=')) continue
      process.env.DATABASE_URL = trimmed.slice('DATABASE_URL='.length).trim()
    }
  }
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/agora_catalog' },
  casing: 'snake_case',
})
