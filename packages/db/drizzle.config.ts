import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  // Только для drizzle-kit generate. Рантайм подключается через getDb() из src/index.ts:
  // там же выбор движка (PGlite в dev, node-postgres на сервере).
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/agora_catalog' },
  casing: 'snake_case',
})
