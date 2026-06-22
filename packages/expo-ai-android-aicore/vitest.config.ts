import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['plugin/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['plugin/src/**/*.ts'],
      exclude: ['plugin/src/**/*.test.ts', 'plugin/src/__tests__/**'],
    },
  },
});
