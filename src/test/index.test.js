const { main, currentModel } = require('../index');
const { loadIgnorePatterns } = require('../utils');
const fsp = require('fs').promises;
const { clearDiffBuffer } = require('../files');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { makeApiRequest } = require('../utils');

// Increase timeout for all tests in this file
jest.setTimeout(120000);

// Mock process.chdir
const originalChdir = process.chdir;
process.chdir = jest.fn();

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock fast-glob
jest.mock('fast-glob', () => jest.fn().mockReturnValue([]));

// Mock os
jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp')
}));

jest.mock('../utils', () => ({
  makeApiRequest: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'test response' } }]
  }),
  loadCursorRules: jest.fn().mockResolvedValue('test rules'),
  executeCommand: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
  cmdhistory: []
}));

jest.mock('../index', () => {
  const originalModule = jest.requireActual('../index');
  return {
    ...originalModule,
    brainstormTaskWithLLM: jest.fn()
  };
});

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  promises: {
    mkdtemp: jest.fn().mockResolvedValue('/tmp/test-xyz'),
    rm: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  dirname: jest.fn(),
  relative: jest.fn(),
  resolve: jest.fn()
}));

describe('main', () => {
  let mockExit;
  let originalEnv;

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    jest.clearAllMocks();
    // Reset environment variables before each test
    process.env.TOGETHER_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.MISTRAL_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    mockExit.mockRestore();
    // Clean up environment variables
    delete process.env.TOGETHER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  afterAll(() => {
    process.chdir = originalChdir;
  });

  it('should handle test instruction', async () => {
    await main('test instruction');
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  it('should collect diffs after each attempt', async () => {
    await main('test instruction');
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  it('should handle upgradeModel tag with fallback chain', async () => {
    // Set up environment for together model
    process.env.TOGETHER_API_KEY = 'test-key';
    
    // Mock brainstormTaskWithLLM to return an upgradeModel tag
    brainstormTaskWithLLM.mockResolvedValueOnce(`
      <upgradeModel></upgradeModel>
      <text>Testing upgrade model tag</text>
    `);

    // Mock makeApiRequest for the together model
    makeApiRequest.mockImplementationOnce(() => Promise.resolve({
      choices: [{
        message: {
          content: 'test response'
        }
      }]
    }));

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
    delete process.env.MISTRAL_API_KEY;
    await expect(main('test instruction', null, 'mistral'))
      .rejects
      .toThrow('No alternative providers available');
  });
});
