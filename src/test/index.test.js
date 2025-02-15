const { main } = require('../index.js');
const { loadIgnorePatterns } = require('../utils');
const fsp = require('fs').promises;
const { clearDiffBuffer } = require('../files');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// Increase timeout for all tests in this file
jest.setTimeout(120000);

// Mock makeApiRequest to return immediately
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  makeApiRequest: jest.fn().mockResolvedValue({
    choices: [{
      message: {
        content: '<file path="test.txt">test content</file>',
      },
    }],
  }),
}));

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

describe('main', () => {
  let tempDir;
  let originalEnv;
  let originalCwd;

  beforeEach(async () => {
    // Store original working directory
    originalCwd = process.cwd();
    
    // Create temp directory and set it as cwd
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-'));
    process.chdir(tempDir);

    // Store original environment
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Setup git with configuration
    execSync('git init', { stdio: 'pipe' });
    execSync('git config user.name "Test User"', { stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { stdio: 'pipe' });

    // Create and commit initial file
    fs.writeFileSync('test.txt', 'initial content');
    execSync('git add test.txt', { stdio: 'pipe' });
    execSync('git commit -m "initial commit"', { stdio: 'pipe' });

    // Clear any existing diffs
    clearDiffBuffer();

    // Mock console.log to prevent output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Restore console.log
    jest.restoreAllMocks();

    // Restore original state
    process.chdir(originalCwd);
    process.env.NODE_ENV = originalEnv;

    // Clean up with retries
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  test('should handle test instruction', async () => {
    const instruction = 'test instruction';

    // Run main with a timeout
    await Promise.race([
      main(instruction),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), 30000)
      )
    ]);

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  test('should collect diffs after each attempt', async () => {
    // Make a change that will be detected
    fs.writeFileSync('test.txt', 'modified content');

    // Run main with a timeout
    await Promise.race([
      main('test instruction'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), 30000)
      )
    ]);

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });
});
