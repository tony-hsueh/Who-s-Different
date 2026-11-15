import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'test-results',
      'playwright-report',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'src/server/**/*.ts',
      'tests/**/*.ts',
      'e2e/**/*.ts',
      'scripts/**/*.ts',
      'scripts/**/*.mjs',
      '*.config.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
