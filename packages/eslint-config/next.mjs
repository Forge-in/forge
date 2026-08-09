// Next.js dashboard preset: core-web-vitals + the Next TypeScript rules on top
// of the shared base, so react-hooks violations fail the same way everywhere.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import base, { ignores } from './base.mjs';

export default defineConfig([
  globalIgnores([...ignores, 'out/**', 'next-env.d.ts']),
  ...base,
  ...nextVitals,
  ...nextTs,
  // Last word: switch off anything that would fight Prettier.
  prettier,
]);
