import { defineConfig } from 'drizzle-kit'
import { loadEnv } from './src/env'

loadEnv()

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/agora_catalog' },
  casing: 'snake_case',
})
