module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
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
  ],
  runner: 'jest-light-runner',
  forceExit: true
};
