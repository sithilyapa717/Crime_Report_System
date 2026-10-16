import tseslint from 'typescript-eslint';

// Layer rules (TEAM_WORK_SPLIT.md): UI must not import packages/db; services must not
// contain SQL; db must not import UI or services.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'prototype/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['apps/desktop/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/packages/db/**', '@excise/db*'] }],
    },
  },
  {
    files: ['packages/db/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['**/apps/desktop/renderer/**', '**/packages/services/**', '@excise/services*'],
        },
      ],
    },
  },
);
