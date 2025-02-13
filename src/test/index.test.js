const { calculateDirectorySize, listFiles, main } = require('../index.js');
const { loadIgnorePatterns } = require('../utils');
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');
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
z;
// Mock process.exit
const mockExit = jest.fn();
process.exit = mockExit;

describe('calculateDirectorySize', () => {
  let tempDir;
  let originalCwd;
  let originalEnv;

  beforeEach(async () => {
    // Store original environment
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Store original working directory
    originalCwd = process.cwd();

    // Create a temporary directory
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-'));

    // Change to temp directory for consistent relative paths
    process.chdir(tempDir);

    // Create some test files with known content
    const subdirPath = path.join(tempDir, 'subdir');
    await fsp.mkdir(subdirPath, { recursive: true });

    // Create test files with specific content
    await Promise.all([
      fsp.writeFile(path.join(tempDir, 'file1.txt'), 'Hello'),
      fsp.writeFile(path.join(tempDir, 'file2.txt'), 'World'),
      fsp.writeFile(path.join(subdirPath, 'file3.txt'), 'Nested'),
    ]);
  });

  afterEach(async () => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Restore original working directory
    process.chdir(originalCwd);

    // Clean up the temporary directory
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  });

  it('should calculate the total size of files in a directory', async () => {
    const ig = ignore().add(['file2.txt']);
    const size = await calculateDirectorySize(tempDir, ig);

    // Get actual file sizes
    const file1Size = Buffer.from('Hello').length;
    const file3Size = Buffer.from('Nested').length;

    expect(size).toBe(file1Size + file3Size);
  });

  it('should ignore files matching ignore patterns', async () => {
    // Create an ignore file with specific patterns
    const ignoreContent = 'file2.txt\n*.ignored';
    const ig = ignore().add(ignoreContent.split('\n').filter((l) => !l.startsWith('#')));

    // Create an additional ignored file
    await fsp.writeFile(path.join(tempDir, 'test.ignored'), 'Should be ignored');

    const size = await calculateDirectorySize(tempDir, ig);

    // Get actual file sizes
    const file1Size = Buffer.from('Hello').length;
    const file3Size = Buffer.from('Nested').length;

    expect(size).toBe(file1Size + file3Size);
  });
});

describe('listFiles', () => {
  let tempDir;

  beforeEach(async () => {
    // Create a temporary directory
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-'));

    // Create some test files
    const subdirPath = path.join(tempDir, 'subdir');
    await fsp.mkdir(subdirPath, { recursive: true });

    await Promise.all([
      fsp.writeFile(path.join(tempDir, 'file1.txt'), 'Hello'),
      fsp.writeFile(path.join(tempDir, 'file2.txt'), 'World'),
      fsp.writeFile(path.join(subdirPath, 'file3.txt'), 'Nested'),
    ]);
  });

  afterEach(async () => {
    // Clean up the temporary directory
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('should list files in a directory', async () => {
    const ig = await loadIgnorePatterns();
    const fileList = await listFiles(tempDir, ig);

    const file1Size = (await fsp.stat(path.join(tempDir, 'file1.txt'))).size;
    const file2Size = (await fsp.stat(path.join(tempDir, 'file2.txt'))).size;
    const file3Size = (await fsp.stat(path.join(tempDir, 'subdir', 'file3.txt'))).size;

    expect(fileList).toContain(`file1.txt (${file1Size}B)`);
    expect(fileList).toContain(`file2.txt (${file2Size}B)`);
    expect(fileList).toContain('subdir/ (0KB)');
    expect(fileList).toContain(`  file3.txt (${file3Size}B)`);
  });

  it('should ignore files matching ignore patterns', async () => {
    // Create an ignore file
    await fsp.writeFile(path.join(tempDir, '.llmignore'), 'file2.txt');

    const ig = await loadIgnorePatterns();
    const fileList = await listFiles(tempDir, ig);

    const file1Size = (await fsp.stat(path.join(tempDir, 'file1.txt'))).size;
    const file3Size = (await fsp.stat(path.join(tempDir, 'subdir', 'file3.txt'))).size;

    expect(fileList).toContain(`file1.txt (${file1Size}B)`);
    expect(fileList).toContain('subdir/ (0KB)');
    expect(fileList).toContain(`  file3.txt (${file3Size}B)`);
    expect(fileList).not.toContain('file2.txt');
  });
});

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

    // Clean up
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up:', error);
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

test('calculateDirectorySize calculates size correctly', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-'));

  try {
    // Create test files
    await fsp.writeFile(path.join(tempDir, 'file1.txt'), 'Hello');
    await fsp.mkdir(path.join(tempDir, 'subdir'));
    await fsp.writeFile(path.join(tempDir, 'subdir', 'file3.txt'), 'World!');
    await fsp.writeFile(path.join(tempDir, 'file2.txt'), 'Ignore');

    // Create ignore pattern
    const ig = ignore().add('file2.txt');

    // Calculate directory size
    const size = await calculateDirectorySize(tempDir, ig);

    // Verify the size (file1.txt: 5 bytes, file3.txt: 6 bytes)
    expect(size).toBe(11);
  } finally {
    // Clean up temporary directory
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

// Mock fetch
global.fetch = jest.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content: 'Test response' } }] }),
}));

// Mock the tools module
jest.mock('../tools', () => ({
  getTools: jest.fn().mockReturnValue([
    {
      name: 'executeCommand',
      description: 'Execute a shell command',
      execute: jest.fn().mockResolvedValue('mocked output'),
    },
    {
      name: 'writeFile',
      description: 'Write content to a file',
      execute: jest.fn().mockResolvedValue(undefined),
    },
  ]),
  executeToolCall: jest.fn().mockResolvedValue('mocked tool result'),
}));

jest.setTimeout(30000); // Increase timeout to 30 seconds
