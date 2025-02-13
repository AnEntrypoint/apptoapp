module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  transform: {
    '^.+\\.js$': '<rootDir>/jest-transformer.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob)/)', // Allow transforming specific ESM packages
  ],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './test-results',
      outputName: 'junit.xml',
    }],
  ],
  verbose: true,
  setupFiles: ['./jest.setup.js'],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json'],
  testTimeout: 10000, // Ensure tests time out after 10 seconds
};
