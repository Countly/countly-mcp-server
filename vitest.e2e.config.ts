import { defineConfig, configDefaults } from 'vitest/config';

/**
 * Live end-to-end suite: runs build/index.js against real Countly servers.
 * Kept out of `npm test` (which must stay hermetic); run with `npm run test:e2e`.
 * See CONTRIBUTING.md for the required environment variables.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    include: ['tests/e2e/**/*.e2e.ts'],
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Live servers are slow and occasionally flaky; one retry absorbs a
    // dropped connection without hiding a consistent failure.
    retry: 1,
  },
});
