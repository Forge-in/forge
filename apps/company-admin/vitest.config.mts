import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfigPaths reads the `@/*` -> `./src/*` mapping straight out of tsconfig.json,
  // so imports in tests look identical to imports in app code.
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Fixtures are data, not logic, and they are scheduled for deletion once the
        // API lands — covering them would only make their removal look like a regression.
        'src/lib/data/**',
        'src/**/*.test.{ts,tsx}',
      ],
      reporter: ['text', 'lcov'],
      // Per-file and deliberately narrow. These three carry a real bar because a silent
      // bug in them is expensive: an open redirect, a mis-parsed URL, or wrong money on
      // screen. The rest of the app — components, and the remaining src/lib modules
      // (metrics, navigation, status, theme, clipboard, cn, session) — is genuinely
      // uncovered today. That is recorded as a known gap rather than hidden behind a
      // flattering global average. Widen this map as modules get tested; ratchet the
      // numbers on a calendar cadence, never automatically.
      thresholds: {
        'src/lib/redirect.ts': { lines: 100, statements: 100, branches: 100, functions: 100 },
        'src/lib/search-params.ts': { lines: 100, statements: 100, branches: 100, functions: 100 },
        // 96.15% branches is the honest ceiling here, not laziness: `word[0]?.toUpperCase()
        // ?? ''` in initials() has an unreachable fallback that noUncheckedIndexedAccess
        // forces us to write. Verified this bar gates — raising it to 100 fails the run.
        'src/lib/format.ts': { lines: 100, statements: 100, branches: 95, functions: 100 },
      },
    },
  },
});
