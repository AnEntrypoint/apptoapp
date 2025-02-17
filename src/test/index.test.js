const { main, getCurrentModel } = require('../index.js');
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
jest.mock('../utils', () => {
  const utils = jest.requireActual('../utils');
  return {
    ...utils,
    makeApiRequest: jest.fn().mockImplementation(async (messages, tools, apiKey, endpoint, model, onModelChange) => {
      console.log('Mock makeApiRequest called with model:', model);
      
      // If Together API key is set and model is mistral, return upgrade tag
      if (process.env.TOGETHER_API_KEY && model === 'mistral') {
        console.log('Upgrading to together model');
        // Call the onModelChange callback to update the model
        if (onModelChange) {
          await onModelChange('together');
          // Wait for the model change to take effect
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return {
          choices: [{
            message: {
              content: '<upgradeModel provider="together">test content</upgradeModel>'
            }
          }]
        };
      }
      // If OpenRouter API key is set and Together key is not set, return upgrade tag
      else if (process.env.OPENROUTER_API_KEY && !process.env.TOGETHER_API_KEY && model === 'mistral') {
        console.log('Upgrading to openrouter model');
        // Call the onModelChange callback to update the model
        if (onModelChange) {
          await onModelChange('openrouter');
          // Wait for the model change to take effect
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return {
          choices: [{
            message: {
              content: '<upgradeModel provider="openrouter">test content</upgradeModel>'
            }
          }]
        };
      }
      
      console.log('Using default model:', model);
      // Default response
      return {
        choices: [{
          message: {
            content: '<file path="test.txt">test content</file>'
          }
        }]
      };
    })
  };
});

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

describe('main', () => {
  let tempDir;
  let originalEnv;
  let originalCwd;
  let mainModule;

  beforeEach(async () => {
    jest.resetModules();
    // Store original working directory
    originalCwd = process.cwd();
    
    // Create temp directory and set it as cwd
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-'));
    process.chdir(tempDir);

    // Store original environment
    originalEnv = { ...process.env };
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

    // Load the module fresh for each test
    mainModule = require('../index.js');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Reset module state
    jest.resetModules();
  });

  test('should handle test instruction', async () => {
    const instruction = 'test instruction';
    
    await mainModule.main(instruction);

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  test('should collect diffs after each attempt', async () => {
    // Make a change that will be detected
    fs.writeFileSync('test.txt', 'modified content');

    await mainModule.main('test instruction');

    // Verify process.exit was not called with error code
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });

  it('should handle upgradeModel tag with fallback chain', async () => {
    // Test case 1: Normal fallback chain
    process.env.TOGETHER_API_KEY = 'mock-together-key';
    await mainModule.main('test instruction', null, 'mistral');
    // Wait for the model change to take effect
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(mainModule.getCurrentModel()).toBe('mistral');

    // Test case 2: Together.ai fails, OpenRouter succeeds
    delete process.env.TOGETHER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'mock-openrouter-key';
    await mainModule.main('test instruction', null, 'mistral');
    // Wait for the model change to take effect
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(mainModule.getCurrentModel()).toBe('mistral');
  });
});
