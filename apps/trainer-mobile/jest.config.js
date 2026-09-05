/**
 * jest-expo supplies the Metro/Babel transform, the React Native module mocks and the
 * asset stubs. Without its preset, importing anything from 'react-native' fails outright,
 * so this file is what makes the app testable at all rather than a nicety.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Stubs the native edges (fonts, splash, storage, safe-area) before any test module loads.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov'],

  // Jest's 5s default is not a budget these tests can live inside.
  //
  // App.test.tsx mounts the entire app — real theme, router, providers and every screen — once
  // per test, 15 times over. That takes ~200ms each on an idle developer machine and roughly
  // 17x that on a CI runner, where `turbo run lint typecheck test build` has two Next builds,
  // two vitest suites and the Nest suite competing for the same cores. The result was nine
  // `Exceeded timeout of 5000 ms` failures on a suite that passes in 9s when run alone, with
  // ClientDetailScreen.test.tsx timing out on a bare render-and-assert that has no async work
  // in it at all.
  //
  // Eight of the nine were plain timeouts. The ninth looked different — "unable to find an
  // element with testID: toast" — but it was a knock-on: the test before it had timed out
  // mid-flight, so cleanup never completed and the query read a stale tree still showing the
  // previous screen. Worth knowing before anyone "fixes" it with fake timers; that was tried,
  // and discarding the fake clock mid-suite left RNTL's afterEach unable to unmount, which
  // hung every remaining test in the file.
  //
  // 30s matches apps/api/test/jest-e2e.json. It is headroom for a slow, contended machine, not
  // permission for a slow test: the typical test here is ~3s on CI, so nothing should come
  // close to this ceiling. If something does, that is a regression to investigate, not to raise.
  testTimeout: 30_000,
};
