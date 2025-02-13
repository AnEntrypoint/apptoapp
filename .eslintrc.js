module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:jest/recommended',
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Add your custom rules here
    'no-console': 'warn',
    'no-unused-vars': 'error',
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/prefer-to-have-length': 'warn',
    'jest/valid-expect': 'error',
    'no-trailing-spaces': 'error', // Ensure no trailing spaces
    'no-multiple-empty-lines': ['error', { max: 1 }], // Limit multiple empty lines
    quotes: ['error', 'single'], // Enforce single quotes
    semi: ['error', 'always'], // Enforce semicolons
    'comma-dangle': ['error', 'always-multiline'], // Enforce trailing commas in multiline objects/arrays
  },
  plugins: ['jest'],
};
