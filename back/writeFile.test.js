const fs = require('fs');
const path = require('path');
const writeFile = require('../../../tools/writeFile');

describe('writeFile', () => {
  const testFilePath = path.join(__dirname, 'testfile.txt');

  afterEach(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should write content to a file', async () => {
    await writeFile(testFilePath, 'Hello, World!');
    const content = fs.readFileSync(testFilePath, 'utf-8');
    expect(content).toBe('Hello, World!');
  });

  test('should handle errors when writing to a file', async () => {
    const invalidPath = path.join(__dirname, '..', '..', 'nonexistent', 'testfile.txt');
    await expect(writeFile(invalidPath, 'Hello, World!')).rejects.toThrow();
  });
});
