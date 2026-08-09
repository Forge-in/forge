// Expo / React Native preset. eslint-config-expo ships CommonJS; the default
// import needs the explicit .js entry, because 'eslint-config-expo/flat' is
// also a directory and ESM (unlike require) will not resolve a directory import.
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';
import base, { ignores } from './base.mjs';

export default defineConfig([
  { ignores },
  ...base,
  expoConfig,
  {
    // metro.config.js / babel.config.js must stay CommonJS — the RN toolchain
    // loads them with require() before any ESM transform is available.
    files: ['**/*.config.js', '**/*.config.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Last word: switch off anything that would fight Prettier.
  prettier,
]);
