import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'apps/**/*.{test,spec}.{ts,tsx}',
      'tests/reports-parity/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
