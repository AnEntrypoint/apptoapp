const { program } = require('commander');

// Mock the transform module
jest.mock('../transform', () => ({
  transform: jest.fn(),
  cycleTasks: jest.fn()
}));

describe('CLI', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockExit;
  let originalArgv;
  let originalExit;

  beforeEach(() => {
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    originalArgv = process.argv;
    originalExit = process.exit;
    mockExit = jest.fn();
    process.exit = mockExit;
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    process.exit = originalExit;
    process.argv = originalArgv;
    jest.clearAllMocks();
  });

  it('should call cycleTasks with the correct arguments', async () => {
    const url = 'https://example.com';
    const instruction = 'test instruction';

    await jest.isolateModules(async () => {
      const transform = require('../transform');
      transform.cycleTasks.mockResolvedValueOnce();

      process.argv = ['node', 'cli.js', url, instruction];

      await require('../cli');

      expect(transform.cycleTasks).toHaveBeenCalledWith(url, instruction);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(url));
      expect(mockConsoleLog).toHaveBeenCalledWith('Task completed successfully');
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  it('should handle errors from cycleTasks', async () => {
    const url = 'https://example.com';
    const instruction = 'test instruction';
    const error = new Error('Test error');

    await jest.isolateModules(async () => {
      const transform = require('../transform');
      transform.cycleTasks.mockRejectedValueOnce(error);

      process.argv = ['node', 'cli.js', url, instruction];

      await require('../cli');

      expect(transform.cycleTasks).toHaveBeenCalledWith(url, instruction);
      expect(mockConsoleError).toHaveBeenCalledWith('Cycle encountered an error:', error);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  it('should handle missing arguments', async () => {
    await jest.isolateModules(async () => {
      process.argv = ['node', 'cli.js'];

      await require('../cli');

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('missing required argument'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});