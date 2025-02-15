module.exports = {
  testEnvironment: 'node',
  testTimeout: 120000,
  setupFilesAfterEnv: ['./jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.cursor/',
    '/.vscode/'
  ],
  modulePathIgnorePatterns: [
    '/.cursor/',
    '/.vscode/'
  ],
  watchPathIgnorePatterns: [
    '/.cursor/',
    '/.vscode/'
  ],
  reporters: [
    'default',
    'jest-junit'
  ]
};
