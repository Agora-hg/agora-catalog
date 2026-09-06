import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/tests/setup-env.ts'],
    env: {
      MOCK_API: '1',
      NEXT_PUBLIC_API_URL: 'https://api.example.ru/v1',
      NEXT_PUBLIC_SITE_URL: 'https://catalog.example.ru',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  esbuild: { jsx: 'automatic' },
})
