import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'landing/**', 'dist/**', 'store-assets/**', '.history/**', 'lib/vendor/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none'
      }],
      'no-undef': 'error',
      'no-console': 'off',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn'
    }
  },
  {
    files: ['tests/**/*.js', 'vitest.config.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node }
    }
  }
];
