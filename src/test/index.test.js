const { main } = require('../index.js');
const { loadIgnorePatterns } = require('../utils');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;

// Increase timeout for all tests in this file
jest.setTimeout(60000);

// Mock makeApiRequest
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  makeApiRequest: jest.fn().mockResolvedValue({
    choices: [{
      message: {
        content: 'Test response',
        tool_calls: [],
      },
    }],
  }),
}));

// Mock process.exit
const mockExit = jest.fn();
process.exit = mockExit;

// Helper function to retry cleanup with exponential backoff
async function retryCleanup(dir, maxAttempts = 5) {
  console.log('Attempting cleanup of:', dir);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fsp.rm(dir, { recursive: true, force: true });
      console.log('Cleanup successful on attempt:', attempt);
      return;
    } catch (error) {
      console.log(`Cleanup attempt ${attempt} failed:`, error.code);
      if (attempt === maxAttempts) {
        throw error;
      }
      // Wait with exponential backoff before retrying
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }
}

describe('main', () => {
  let tempDir;
  let originalCwd;
  let originalEnv;
  let mockFetch;

  beforeEach(async () => {
    // Create temp directory and set it as cwd
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Store original environment
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Mock fetch
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: 'Test response',
            tool_calls: [],
          },
        }],
      }),
    });
    global.fetch = mockFetch;

    // Create test files and node_modules directory
    await Promise.all([
      fsp.mkdir(path.join(tempDir, 'node_modules'), { recursive: true }),
      fsp.writeFile(path.join(tempDir, 'file1.txt'), 'Hello'),
      fsp.writeFile(path.join(tempDir, 'file2.txt'), 'World'),
    ]);

    // Reset mocks
    mockExit.mockReset();
  });

  afterEach(async () => {
    // Restore original state
    process.chdir(originalCwd);
    process.env.NODE_ENV = originalEnv;

    // Clean up with retries
    try {
      await retryCleanup(tempDir);
    } catch (error) {
      console.error('Final cleanup attempt failed:', error);
      // If cleanup fails after all retries, we should restart the test process
      process.kill(process.pid, 'SIGTERM');
    }

    jest.clearAllMocks();
  });

  it('should handle test instruction', async () => {
    const instruction = 'test instruction';

    // Run main and wait for it to complete
    await main(instruction);

    // Verify API was called
    expect(mockFetch).toHaveBeenCalled();

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  }, 35000); // Increase timeout for this specific test
});
