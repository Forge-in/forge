// Root flat config. Serves packages/* and the lint-staged pre-commit hook.
// Each app under apps/ ships its own config (eslint-config-next, the NestJS
// typescript-eslint setup, eslint-config-expo) and those take precedence when
// ESLint runs with that app as its working directory.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },
  js.configs.recommended,
  // Not the type-checked preset: this config is also used by lint-staged across
  // every workspace, and a type-aware run needs one project service per app.
  ...tseslint.configs.recommended,
  prettier,
);
