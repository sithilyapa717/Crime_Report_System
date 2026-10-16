import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/*.test.ts', 'tests/reports-parity/**/*.test.ts'] },
});
