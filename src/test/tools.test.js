
const { executeCommand } = require('../tools');

describe('tools', () => {
  test('should execute a command and return the output', async () => {
    const result = await executeCommand('echo Hello, World!');
    expect(result).toBe('Hello, World!\n');
  });

  test('should handle errors when executing a command', async () => {
    await expect(executeCommand('invalid-command')).rejects.toThrow();
  });
});
