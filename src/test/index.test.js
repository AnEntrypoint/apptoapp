const { main, currentModel, brainstormTaskWithLLM } = require('../index');
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
    
    await main(instruction);

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  test('should collect diffs after each attempt', async () => {
    // Make a change that will be detected
    fs.writeFileSync('test.txt', 'modified content');

    await main('test instruction');

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  it('should handle upgradeModel tag with fallback chain', async () => {
    // Mock brainstormTaskWithLLM to return an upgradeModel tag
    const mockBrainstorm = jest.spyOn(brainstormTaskWithLLM, 'mockImplementation')
      .mockResolvedValue(`
        <upgradeModel></upgradeModel>
        <text>Testing upgrade model tag</text>
      `);

    // Save original environment variables
    const originalEnv = {
      TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY
    };

    // Test case 1: Together.ai succeeds
    process.env.TOGETHER_API_KEY = 'test-together-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.GROQ_API_KEY = 'test-groq-key';

    const result1 = await main('test instruction', null, 'mistral');
    expect(currentModel()).toBe('together');

    // Test case 2: Together.ai fails, OpenRouter succeeds
    delete process.env.TOGETHER_API_KEY;
    const result2 = await main('test instruction', null, 'mistral');
    expect(currentModel()).toBe('openrouter');

    // Test case 3: Together.ai and OpenRouter fail, Groq succeeds
    delete process.env.OPENROUTER_API_KEY;
    const result3 = await main('test instruction', null, 'mistral');
    expect(currentModel()).toBe('groq');

    // Test case 4: All providers fail
    delete process.env.GROQ_API_KEY;
    await expect(main('test instruction', null, 'mistral'))
      .rejects
      .toThrow('No alternative providers available');

    // Restore original environment variables
    process.env.TOGETHER_API_KEY = originalEnv.TOGETHER_API_KEY;
    process.env.OPENROUTER_API_KEY = originalEnv.OPENROUTER_API_KEY;
    process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY;

    mockBrainstorm.mockRestore();
  });
});
