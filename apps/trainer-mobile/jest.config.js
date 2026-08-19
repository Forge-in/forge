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
};
