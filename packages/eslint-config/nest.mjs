// NestJS API preset. Type-checked rules are affordable here because the API is
// a single tsconfig project; the repo-wide base preset cannot afford them.
//
// Exported as a factory: type-aware linting needs `tsconfigRootDir` to point at
// the *consuming app*, which this file cannot know. The app passes its own
// `import.meta.dirname`, so the rules resolve identically from the app, from
// turbo, and from a repo-root lint-staged run.
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import base, { ignores, testFileOverrides } from './base.mjs';

export function nestConfig(tsconfigRootDir) {
  return tseslint.config(
    { ignores: [...ignores, 'eslint.config.mjs'] },
    ...base,
    ...tseslint.configs.recommendedTypeChecked,
    prettierRecommended,
    {
      languageOptions: {
        globals: { ...globals.node, ...globals.jest },
        sourceType: 'commonjs',
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        // endOfLine: auto keeps Windows checkouts from failing on CRLF.
        'prettier/prettier': ['error', { endOfLine: 'auto' }],
      },
    },
    // Must come after recommendedTypeChecked: flat config is last-one-wins, so applying
    // this earlier (inside base) would be undone by the type-checked preset above.
    testFileOverrides,
    prettier,
  );
}

export default nestConfig;
