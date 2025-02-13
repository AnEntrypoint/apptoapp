// test/cli.test.js
const { program } = require('commander');
const { cycleTasks } = require('../transform');

jest.mock('../transform', () => ({
  cycleTasks: jest.fn(),
}));

describe('CLI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should call cycleTasks with the correct arguments', async () => {
    const url = 'http://example.com';
    const instruction = 'Test instruction';

    await program.parseAsync(['node', 'cli.js', url, instruction]);

    expect(cycleTasks).toHaveBeenCalledWith(url, instruction);
  });

  test('should handle errors from cycleTasks', async () => {
    const url = 'http://example.com';
    const instruction = 'Test instruction';
    const error = new Error('Test error');

    cycleTasks.mockRejectedValueOnce(error);

    await expect(program.parseAsync(['node', 'cli.js', url, instruction])).rejects.toThrow(error);
  });
});
