import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@engine': r('./src/engine'),
      '@data': r('./src/data'),
      '@storage': r('./src/storage'),
      '@game': r('./src/game'),
      '@lib': r('./src/lib'),
    },
  },
})
