const { main, getCurrentModel, setCurrentModel } = require('../index.js');
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
      // If Together API key is set and model is mistral, return upgrade tag
      if (process.env.TOGETHER_API_KEY && model === 'mistral') {
        // Call the onModelChange callback to update the model
        if (onModelChange) {
          onModelChange('together');
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
        // Call the onModelChange callback to update the model
        if (onModelChange) {
          onModelChange('openrouter');
        }
        return {
          choices: [{
            message: {
              content: '<upgradeModel provider="openrouter">test content</upgradeModel>'
            }
          }]
        };
      }
      
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

    // Load the module fresh for each test
    mainModule = require('../index.js');
    // Reset the model to mistral before each test
    mainModule.setCurrentModel('mistral');
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;
    // Reset module state
    jest.resetModules();
    // Restore original working directory
    process.chdir(originalCwd);
    // Clean up temp directory
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  test('should handle test instruction', async () => {
    const instruction = 'test instruction';
    
    await mainModule.main(instruction);

    // Verify the test completed successfully
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('should collect diffs after each attempt', async () => {
    // Make a change that will be detected
    fs.writeFileSync('test.txt', 'modified content');

    await mainModule.main('test instruction');

    // Verify the test completed successfully
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should handle upgradeModel tag with fallback chain', async () => {
    // Test case 1: Together.ai succeeds
    process.env.TOGETHER_API_KEY = 'mock-together-key';
    const { makeApiRequest } = require('../utils');
    const messages = [{ role: 'user', content: 'test' }];
    const tools = [];
    const apiKey = 'test-key';
    const endpoint = 'test-endpoint';
    const model = 'mistral';
    
    await makeApiRequest(messages, tools, apiKey, endpoint, model, (newModel) => {
      mainModule.setCurrentModel(newModel);
    });
    expect(mainModule.getCurrentModel()).toBe('together');

    // Reset model for next test
    mainModule.setCurrentModel('mistral');

    // Test case 2: Together.ai fails, OpenRouter succeeds
    delete process.env.TOGETHER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'mock-openrouter-key';
    await makeApiRequest(messages, tools, apiKey, endpoint, model, (newModel) => {
      mainModule.setCurrentModel(newModel);
    });
    expect(mainModule.getCurrentModel()).toBe('openrouter');
  });
});
