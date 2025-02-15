module.exports = {
  env: {
    node: true,
    browser: true,
    es6: true,
    jest: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
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
    afterAll: true
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'off',  // Temporarily disable no-unused-vars
    'no-prototype-builtins': 'off',
    'no-control-regex': 'off',
    'no-useless-escape': 'off',
    'no-func-assign': 'off',
    'no-cond-assign': 'off',
    'no-undef': 'off'  // Temporarily disable no-undef while we sort out the module system
  },
  ignorePatterns: [
    'dist/**/*', 
    'node_modules/**/*',
    'coverage/**/*',
    '*.config.js',
    'main.js',
    'jest-transformer.js',
    'jest.setup.js',
    'src/**/*.test.js'
  ]
} 