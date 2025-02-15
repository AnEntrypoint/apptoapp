module.exports = {
  env: {
    node: true,
    browser: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  globals: {
    process: true,
    __dirname: true,
    Buffer: true,
    setImmediate: true,
    jest: true,
    describe: true,
    test: true,
    expect: true,
    beforeEach: true,
    afterEach: true,
    afterAll: true,
  },
  rules: {
    'no-unused-vars': ['error', { 
      ignoreRestSiblings: true,
      args: 'none',
      varsIgnorePattern: '^_',
      argsIgnorePattern: '^_',
    }],
    'no-prototype-builtins': 'off',
    'no-control-regex': 'off',
    'no-useless-escape': 'off',
    'no-func-assign': 'off',
    'no-undef': 'off',
    'no-cond-assign': 'off',
  },
  ignorePatterns: ['dist/**/*', 'node_modules/**/*', 'coverage/**/*', '*.config.js', 'main.js'],
  parserOptions: {
    ecmaVersion: 2020,
  },
}; 