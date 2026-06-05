import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    passWithNoTests: true,
    // Keep test discovery scoped to this branch — Claude Code keeps other
    // branches' worktrees under .claude/worktrees, which vitest would otherwise glob.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'build/',
        'tests/',
        '*.config.ts',
        '*.config.js',
        'src/index.ts', // MCP server entry point - requires integration testing
        'src/tools/*.ts', // Tool handlers require live Countly server for integration testing
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
});
