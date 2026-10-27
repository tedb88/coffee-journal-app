import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'evals/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/data/**/*.ts', 'api/_lib/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/domain/index.ts'],
      reporter: ['text-summary', 'text'],
      // NFR-11: the domain core is the source of truth and carries the highest bar.
      thresholds: {
        'src/domain/**/*.ts': { lines: 90, branches: 80, functions: 90, statements: 90 },
      },
    },
  },
})
