import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/scripts/background.ts',
        'src/scripts/content_script.ts',
        'src/options/options.ts',
      ],
      thresholds: {
        branches: 50,
        functions: 70,
        lines: 65,
        statements: 65,
      },
    },
  },
  resolve: {
    alias: {
      // Handle .js imports that should resolve to .ts files
      '@': '/src',
    },
  },
});
