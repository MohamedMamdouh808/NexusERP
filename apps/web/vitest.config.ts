import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Component-test configuration (T048).
 *
 * `@nexuserp/shared` resolves to the package SOURCE, matching the API's Jest
 * moduleNameMapper and keeping one contract source for both applications: a
 * schema change cannot pass here while failing there because a stale `dist`
 * happened to still be on disk. Vite resolves the package's `.js` specifiers back
 * to its TypeScript sources.
 *
 * `@vitejs/plugin-react` is deliberately NOT registered here. It exists for Fast
 * Refresh in development; the JSX transform in tests comes from esbuild reading
 * `jsx: "react-jsx"` in tsconfig.json, which is the same transform the production
 * build applies. Importing the plugin would also pull in the second copy of Vite
 * that Vitest 2 bundles (Vite 5, against the application's Vite 6) and the two
 * plugin types, identical in shape, do not unify.
 *
 * There is no `css: true`: component tests assert on roles, accessible names and
 * text, never on computed style. A styling assertion belongs to the design-value
 * check or to the browser suite, where it can actually be evaluated.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@nexuserp/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}', 'scripts/**/*.spec.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // The bootstrap module mounts the application into the document; it has no
        // branch a component test can choose. It is exercised by the browser smoke
        // test instead, where mounting is the thing being verified.
        'src/main.tsx',
        'src/test/**',
        '**/*.d.ts',
        // A test asserting itself is coverage theatre: including the spec files
        // would raise the number without testing anything.
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});