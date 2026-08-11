// Rules that apply to every package regardless of runtime. Runtime-specific
// presets (nest/next/expo) build on top of this rather than repeating it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

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

  // Must stay last: switches off every rule that would fight Prettier.
  prettier,
);
