const fetch = require('node-fetch');

// Polyfill fetch for Node.js
global.fetch = fetch;

// Mock any global configurations or environment variables
process.env.NODE_ENV = 'test';
process.env.JEST_RUNNING = 'true';
process.env.GIT_AUTHOR_NAME = 'apptoapp';
process.env.GIT_AUTHOR_EMAIL = 'author@apptoapp.com';
process.env.GIT_COMMITTER_NAME = 'apptoapp';
process.env.GIT_COMMITTER_EMAIL = 'author@apptoapp.com';

// Mock all logger functions for tests
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  system: jest.fn(),
  git: jest.fn(),
  file: jest.fn()
}));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Prevent actual process.exit in tests
const originalExit = process.exit;
process.exit = (code) => {
  console.warn(`Process exit called with code ${code}, but prevented in test environment`);
  return undefined;
};

// Restore original process.exit after tests
afterAll(() => {
  process.exit = originalExit;
});
