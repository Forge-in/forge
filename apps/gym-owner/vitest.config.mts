import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Tests also live outside src/ so next.config itself can be covered.
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      /**
       * Scoped to the code that HOLDS RULES.
       *
       * `src/app/**` is deliberately absent: those are route modules whose job
       * is composition, and the way to know they work is to render them —
       * which the build's own page-data pass and a request against a running
       * server do, not a jsdom snapshot. Counting them here would let real
       * logic coverage fall while the number went up.
       *
       * The server-only modules are excluded for a harder reason: they import
       * `server-only` and `next/headers`, which cannot load outside a request,
       * so v8 cannot even parse them for the uncovered-file report.
       */
      include: ['src/lib/**/*.ts', 'src/components/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/lib/dal.ts',
        'src/lib/api.ts',
        'src/lib/session.ts',
        'src/lib/session-cookies.ts',
        'src/lib/theme-server.ts',
        // Static records with no behaviour; `data.test.ts` asserts their shape.
        'src/lib/data/**',
      ],
      reporter: ['text', 'lcov'],
      /**
       * A floor, not a target. Set just under what the suite achieves today so
       * it fails on a real regression rather than on a rounding change — and
       * raised deliberately when the bar genuinely moves, never lowered to make
       * a red build green.
       */
      thresholds: {
        statements: 74,
        branches: 69,
        functions: 70,
        lines: 73,
      },
    },
  },
});
