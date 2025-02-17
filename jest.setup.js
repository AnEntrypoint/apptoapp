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
jest.mock('./src/utils/logger', () => {
  const MAX_STRING_LENGTH = 500;
  const MAX_ARRAY_LENGTH = 10;

  const truncate = (str, maxLength = MAX_STRING_LENGTH) => {
    if (str === undefined) return 'undefined';
    if (str === null) return 'null';
    
    if (typeof str !== 'string') {
      try {
        str = JSON.stringify(str, null, 2);
      } catch {
        str = String(str);
      }
    }
    if (str.length <= maxLength) return str;
    const truncated = str.substring(0, maxLength);
    const remaining = str.length - maxLength;
    return `${truncated}⟪ ${remaining} characters skipped ⟫`;
  };

  const formatValue = (value) => {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) {
        const formatted = value.slice(0, MAX_ARRAY_LENGTH).map(formatValue);
        return `[${formatted.join(', ')}, ... (${value.length - MAX_ARRAY_LENGTH} more items)]`;
      }
      return `[${value.map(formatValue).join(', ')}]`;
    }
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      try {
        const formatted = JSON.stringify(value, null, 2);
        return truncate(formatted);
      } catch {
        return '[Complex Object]';
      }
    }
    if (typeof value === 'string' && value.includes('\n')) {
      return '\n' + value.split('\n').map(line => '  ' + line).join('\n');
    }
    return truncate(String(value));
  };

  return {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    system: jest.fn(),
    git: jest.fn(),
    file: jest.fn(),
    truncate,
    formatValue,
    LOG_TYPES: {
      INFO: { color: jest.fn(), prefix: 'ℹ️', padLength: 8 },
      SUCCESS: { color: jest.fn(), prefix: '✅', padLength: 9 },
      WARNING: { color: jest.fn(), prefix: '⚠️', padLength: 9 },
      ERROR: { color: jest.fn(), prefix: '❌', padLength: 7 },
      DEBUG: { color: jest.fn(), prefix: '🔍', padLength: 7 },
      SYSTEM: { color: jest.fn(), prefix: '⚙️', padLength: 8 },
      GIT: { color: jest.fn(), prefix: '📦', padLength: 5 },
      FILE: { color: jest.fn(), prefix: '📄', padLength: 6 }
    },
    MAX_STRING_LENGTH,
    MAX_ARRAY_LENGTH
  };
});

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
