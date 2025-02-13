const fs = require('fs');
const path = require('path');

console.log('Current directory:', __dirname);
console.log('Resolved path:', path.resolve(__dirname, '../../tools/executeCommand'));
console.log('File exists:', fs.existsSync(path.resolve(__dirname, '../../tools/executeCommand.js')));

const executeCommand = require('../../../tools/executeCommand');

describe('executeCommand', () => {
  test('should execute a command and return the output', async () => {
    const result = await executeCommand('echo Hello, World!');
    expect(result).toBe('Hello, World!\n');
  });

  test('should handle errors when executing a command', async () => {
    await expect(executeCommand('invalid-command')).rejects.toThrow();
  });
});
