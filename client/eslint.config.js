import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint is set up to catch mistakes that crash pages at runtime (a white screen),
 * not style preferences. The build does not notice these, so `npm run lint` runs in CI.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    // The code has `eslint-disable react-hooks/exhaustive-deps` notes for a rule left off here.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // A name used but never imported or declared, e.g. `translations is not defined`.
      'no-undef': 'error',
      // A component used in JSX but never imported, e.g. <CardHeader /> with no import.
      'react/jsx-no-undef': 'error',
      // Lets ESLint see that a component used in JSX counts as "used".
      'react/jsx-uses-vars': 'error',
      // Hooks called conditionally or in loops break React's state.
      'react-hooks/rules-of-hooks': 'error',
      // Other real bugs that are cheap to catch.
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
    },
  },
  {
    // Playwright end-to-end tests and tool configs run in Node, not the browser.
    files: ['e2e/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
  },
  {
    // Vitest runs with `globals: true` (describe/it/expect/vi without imports).
    files: ['src/**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
