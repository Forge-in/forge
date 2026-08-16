import { defineConfig } from 'vitest/config';

/**
 * This package is the contract every app and the API agree on, so it carries the
 * highest coverage bar in the repo — and it is the cheapest place to hold one,
 * because everything here is a pure schema or type with no I/O.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Barrels re-export only; there is nothing in them to cover.
      exclude: ['src/**/index.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, statements: 100, branches: 100, functions: 100 },
    },
  },
});
