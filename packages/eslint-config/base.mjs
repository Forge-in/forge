// Rules that apply to every package regardless of runtime. Runtime-specific
// presets (nest/next/expo) build on top of this rather than repeating it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Test files.
 *
 * The `no-unsafe-*` family exists to stop untyped data leaking into production code. In a
 * test the untyped data IS the subject: a supertest `response.body` is `any` by definition,
 * and so is a hand-rolled mock. Casting every assertion adds noise without adding safety,
 * because the assertion is the check.
 *
 * `unbound-method` is off for the same reason: a mock object with method properties is the
 * normal way to stand in for a framework object.
 *
 * Everything that catches real mistakes — no-floating-promises, no-unused-vars — stays on.
 *
 * Exported so presets that layer `recommendedTypeChecked` on top of this file (see
 * nest.mjs) can re-apply it LAST. Flat config is last-one-wins, so a preset that adds
 * type-checked rules after `...base` would otherwise silently re-enable all of these.
 */
export const testFileOverrides = {
  files: [
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.int-test.ts',
    '**/*.e2e-spec.ts',
    '**/test/**/*.ts',
  ],
  rules: {
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/unbound-method': 'off',
  },
};

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

  // Repo tooling runs in Node, not in a browser or a bundler. Without this, `no-undef`
  // from js.configs.recommended flags every `console` and `process` in a build script.
  // Scoped to tooling file patterns so app source keeps its own runtime's globals.
  {
    files: [
      'scripts/**/*.{js,mjs,cjs,ts}',
      '**/*.config.{js,mjs,cjs,ts,mts}',
      '**/vitest.setup.ts',
    ],
    languageOptions: {
      globals: globals.node,
      // Config files are frequently CJS (jest.config.js uses module.exports), and
      // sourceType is what decides whether `module` and `require` are even legal.
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.cjs', '**/jest.config.js', '**/metro.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },

  {
    rules: {
      /**
       * `_`-prefixed means "deliberately unused". Without this the standard way to drop a
       * key — `const { SECRET: _omitted, ...rest } = env` — is a lint error, and the usual
       * workaround is an eslint-disable comment, which suppresses more than intended.
       *
       * ignoreRestSiblings covers exactly that destructuring case.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  testFileOverrides,

  // Must stay last: switches off every rule that would fight Prettier.
  prettier,
);
