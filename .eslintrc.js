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
    'no-unused-vars': ['warn', { 
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
  ignorePatterns: [
    'dist/**/*', 
    'node_modules/**/*',
    'coverage/**/*',
    '*.config.js',
    'main.js',
    'jest-transformer.js',
    'jest.setup.js',
    'src/**/*.test.js',
    'src/test/**/*',
    'webpack.config.js'
  ],
  overrides: [
    {
      files: ['src/**/*.js'],
      rules: {
        'no-unused-vars': ['warn', {
          args: 'none',
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        }],
      }
    },
    {
      files: ['jest.setup.js', 'jest-transformer.js'],
      env: {
        jest: true,
        node: true
      },
      rules: {
        'no-undef': 'off'
      }
    }
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
}; 