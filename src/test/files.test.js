const { diff, generateDiff, getDiffBufferStatus, clearDiffBuffer } = require('../files');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('diff', () => {
  test('should return the difference between two numbers', () => {
    expect(diff(5, 3)).toBe(2);
    expect(diff(10, 4)).toBe(6);
  });

  test('should handle negative numbers', () => {
    expect(diff(-5, -3)).toBe(-2);
    expect(diff(-10, -4)).toBe(-6);
  });

  test('should handle zero', () => {
    expect(diff(0, 0)).toBe(0);
    expect(diff(5, 0)).toBe(5);
    expect(diff(0, 5)).toBe(-5);
  });
});

describe('diff functionality', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    // Store original working directory
    originalCwd = process.cwd();

    // Create a temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-test-'));
    process.chdir(tempDir);

    clearDiffBuffer();

    // Setup git with configuration
    execSync('git init');
    execSync('git config user.name "Test User"');
    execSync('git config user.email "test@example.com"');

    // Create and commit initial file
    fs.writeFileSync('test.txt', 'initial content');
    execSync('git add test.txt');
    execSync('git commit -m "initial commit"');
  });

  afterEach(() => {
    try {
      // Change back to original directory
      process.chdir(originalCwd);

      // On Windows, we need to force close any open handles
      if (process.platform === 'win32') {
        try {
          execSync(`rmdir /s /q "${tempDir}"`, { stdio: 'ignore' });
        } catch (e) {
          console.warn('Windows cleanup failed, will try alternative method');
          // Alternative cleanup method
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } else {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  test('should generate and store diffs', async () => {
    // Make a change
    fs.writeFileSync('test.txt', 'modified content');

    // Create and commit a file change
    execSync('git add test.txt');
    execSync('git commit -m "test change"');

    await generateDiff();
    const xml = getDiffBufferStatus();

    expect(xml).toContain('<diff attempt="1">');
    expect(xml).toContain('diff --git');
    expect(xml).toContain('modified content');
  });

  test('should clear diff buffer', async () => {
    // Make a change and generate diff
    fs.writeFileSync('test.txt', 'modified content');
    await generateDiff();

    // Clear buffer
    clearDiffBuffer();

    // Check if buffer is cleared
    const xml = getDiffBufferStatus();
    expect(xml).toBe('');
  });
});
