import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,js}'],
      exclude: ['src/**/*.d.ts', 'src/client/*.generated.ts'],
      thresholds: {
        lines: 65,
        functions: 65,
        statements: 65,
        branches: 60,
      },
    },
  },
})
