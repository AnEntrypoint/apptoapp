const fetch = require('node-fetch');
const logger = require('./src/utils/logger');

// Polyfill fetch for Node.js
global.fetch = fetch;

// Mock any global configurations or environment variables
process.env.NODE_ENV = 'test';
process.env.JEST_RUNNING = 'true';

// Mock all logger functions for tests
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  system: jest.fn(),
  git: jest.fn(),
  file: jest.fn(),
  truncate: jest.requireActual('./src/utils/logger').truncate,
  formatValue: jest.requireActual('./src/utils/logger').formatValue
}));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Prevent actual process.exit in tests
const originalExit = process.exit;
process.exit = (code) => {
  logger.warn(`Process exit called with code ${code}, but prevented in test environment`);
  return undefined;
};

// Restore original process.exit after tests
afterAll(() => {
  process.exit = originalExit;
});
