import { defineConfig } from 'vitest/config';

/**
 * Unit tests only — no database. Integration tests that need real Postgres live in
 * *.int-test.ts and run under vitest.int.config.mts, so `pnpm test` stays runnable on a
 * laptop with nothing started.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.int-test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.test.ts',
        'src/**/*.int-test.ts',
        'src/schema/**',
        // Covered by the integration suite against a real database, where they mean
        // something; unit-covering them would only assert that mocks were called.
        'src/client.ts',
        'src/tenant.ts',
        'src/migrate.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        // business-date.ts is pure, total, and the single place a timestamp becomes a
        // day. Every uncovered branch here is a day-off-by-one somewhere in the product.
        'src/business-date.ts': { lines: 95, statements: 95, branches: 90, functions: 100 },
      },
    },
  },
});
