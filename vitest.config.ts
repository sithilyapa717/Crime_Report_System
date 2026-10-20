import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'apps/**/*.{test,spec}.{ts,tsx}',
      'tests/reports-parity/**/*.test.ts',
      'tests/migration/**/*.test.ts',
      'tests/database/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // D's packages use node:test and run with `node --test` (pnpm test:documents, CI documents job).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/documents/**',
      'tests/documents-fidelity/**',
    ],
  },
});
