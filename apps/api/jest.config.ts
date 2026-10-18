import type { Config } from 'jest';

/**
 * Two projects in one configuration, so "run the tests" is never ambiguous and the
 * database-backed suite cannot be silently skipped (research.md R-020).
 *
 *   unit        - no database, mocked collaborators. The fast loop.
 *   integration - Supertest against a booted application and a REAL PostgreSQL
 *                 instance, migrations applied. Never a substitute (Principle V).
 *
 * Running `npm test` selects `unit` only. `npm run test:integration` selects
 * `integration`. CI runs both as separate mandatory jobs.
 */
const config: Config = {
  // Coverage thresholds and testTimeout are GLOBAL Jest options, not per-project ones.
  // Thresholds are enforced here rather than in a separate CI step so a developer sees
  // the shortfall before pushing (Constitution Principle V, SC-014).
  testTimeout: 30_000,
  coverageThreshold: {
    global: { statements: 0, branches: 0, functions: 0, lines: 0 },
    './src/common/': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/platform/': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './scripts/': { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/scripts/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
      moduleNameMapper: {
        '^@nexuserp/shared$': '<rootDir>/../../packages/shared/src/index.ts',
        // packages/shared is authored as ESM with explicit .js specifiers; the CommonJS
        // Jest runtime resolves them back to the TypeScript sources.
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      setupFiles: ['<rootDir>/test/setup-unit.ts'],
      collectCoverageFrom: [
        'src/**/*.ts',
        'scripts/**/*.ts',
        '!src/**/*.module.ts',
        '!src/main.ts',
        '!**/*.d.ts',
      ],
    },
    {
      displayName: 'integration',
      rootDir: '.',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
      moduleNameMapper: {
        '^@nexuserp/shared$': '<rootDir>/../../packages/shared/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      setupFiles: ['<rootDir>/test/setup-integration.ts'],
      // Integration tests truncate shared tables between cases, so they must not run
      // against each other in parallel. Enforced by `--runInBand` in the npm script
      // rather than `maxWorkers`, which is not a per-project option.
    },
  ],
};

export default config;