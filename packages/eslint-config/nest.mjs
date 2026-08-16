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

        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'drizzle-orm',
                message:
                  'Import query operators from @forge/db instead. drizzle-orm has an OPTIONAL ' +
                  'peer on @opentelemetry/api, so a second copy appears the moment any ' +
                  'workspace installs OTel — same version, different peer hash, nominally ' +
                  'DIFFERENT SQL<> types. Every where(eq(...)) then stops assigning, with a ' +
                  'wall of generics that says nothing about peer resolution. Routing through ' +
                  '@forge/db keeps exactly one instance in the repo.',
              },
              {
                name: 'drizzle-orm/pg-core',
                message: 'Schema definition belongs in packages/db. Import the table instead.',
              },
            ],
          },
        ],
      },
    },
    // Must come after recommendedTypeChecked: flat config is last-one-wins, so applying
    // this earlier (inside base) would be undone by the type-checked preset above.
    testFileOverrides,
    prettier,
  );
}

export default nestConfig;
