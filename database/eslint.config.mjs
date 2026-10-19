// ESLint flat config for the NexusERP database workspace.
//
// Scope note: this workspace owns the Prisma schema, the migrations, the seed and the
// schema checks. It is a leaf in the dependency graph (research.md R-005): nothing here
// may reach into the service or the web interface, and the rule below makes that fail
// lint rather than review.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nexuserp/api',
              message: 'database/ must not depend on backend/ (research.md R-005).',
            },
            {
              name: '@nexuserp/web',
              message: 'database/ must not depend on frontend/ (research.md R-005).',
            },
          ],
        },
      ],
    },
  },
);
