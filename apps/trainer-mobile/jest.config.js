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
  // 30s matches apps/api/test/jest-e2e.json. It is headroom for a slow, contended machine, not
  // permission for a slow test: nothing here should come close to it.
  testTimeout: 30_000,
};
