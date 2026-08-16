import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node, not jsdom: the client must not depend on anything browser-only, because it also
    // runs under Metro where window and document do not exist. Node 22 supplies fetch,
    // Response and AbortController natively, which is all this package needs.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.test.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        // This package absorbs every mobile-network failure mode for five apps, and a gap
        // here is a bug none of them can work around.
        'src/client.ts': { lines: 85, statements: 85, branches: 75, functions: 85 },
        'src/errors.ts': { lines: 90, statements: 90, branches: 85, functions: 80 },
      },
    },
  },
});
