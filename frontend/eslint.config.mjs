// ESLint flat config for the NexusERP web interface.
//
// Scope note: the check that makes Constitution Principle VIII structural - no raw
// color or font value anywhere under src/ - lives in
// scripts/check-no-raw-design-values.ts and runs via the `check:design-values` script
// (T082), because it scans source text for literals rather than using the type system.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Dependency direction (research.md R-005): the web interface may depend on the
      // shared contract and nothing else. Reaching into the service or the database
      // workspace is a layering break, so it fails lint rather than review.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nexuserp/api',
              message: 'frontend/ must not depend on backend/ (research.md R-005).',
            },
            {
              name: '@nexuserp/database',
              message: 'frontend/ must not depend on database/ (research.md R-005).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);