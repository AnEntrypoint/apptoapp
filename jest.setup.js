const fetch = require('node-fetch');

// Polyfill fetch for Node.js
global.fetch = fetch;

// Mock any global configurations or environment variables
process.env.NODE_ENV = 'test';
process.env.JEST_RUNNING = 'true';

// Optional: Add global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Modify process.exit to prevent hard exits during testing
const originalExit = process.exit;
process.exit = function (code) {
  if (process.env.JEST_RUNNING === 'true') {
    console.warn(`Process exit called with code ${code}, but prevented in test environment`);
    return;
  }
  originalExit(code);
};
