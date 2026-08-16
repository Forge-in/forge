import { defineConfig } from 'vitest/config';

/**
 * Integration tests against a REAL Postgres with migrations applied.
 *
 * Separate from the unit config because tenant isolation is database behaviour: row-level
 * security cannot be unit-tested, and a mocked version of it would only ever assert that
 * the mock was written to agree with the test. These are the only tests in the repo that
 * can prove a studio cannot read another studio's rows.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int-test.ts'],
    // Isolation is the thing under test, so the suite must not race itself for the
    // single pooled connection it deliberately runs on.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
