// Rules that apply to every package regardless of runtime. Runtime-specific
// presets (nest/next/expo) build on top of this rather than repeating it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Build output and tooling caches — never linted, in any package. */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.expo/**',
  '**/coverage/**',
  '**/.turbo/**',
];

export default tseslint.config(
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Must stay last: switches off every rule that would fight Prettier.
  prettier,
);
