const { executeCommand } = require('../tools');

describe('tools', () => {
  test('should execute a command and return the output', async () => {
    const result = await executeCommand('echo test');
    expect(result.stdout).toContain('test');
  });

  test('should handle errors when executing a command', async () => {
    const invalidCommand = 'invalid-command-that-does-not-exist';
    await expect(async () => {
      await executeCommand(invalidCommand);
    }).rejects.toThrow();
  });
});
