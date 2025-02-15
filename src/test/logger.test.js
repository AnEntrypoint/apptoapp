/**
 * @jest-environment node
 */

// Mock chalk before any imports
const mockChalk = {
  blue: jest.fn(str => str),
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  red: jest.fn(str => str),
  gray: jest.fn(str => str),
  magenta: jest.fn(str => str),
  cyan: jest.fn(str => str),
  white: jest.fn(str => str)
};

jest.mock('chalk', () => mockChalk);

// Import logger module
const loggerModule = require('../utils/logger');

describe('logger', () => {
  let consoleLogSpy;
  let originalDateToISOString;
  let logger;

  beforeAll(() => {
    originalDateToISOString = Date.prototype.toISOString;
    Date.prototype.toISOString = jest.fn(() => '2025-01-01T00:00:00.000Z');
  });

  afterAll(() => {
    Date.prototype.toISOString = originalDateToISOString;
  });

  beforeEach(() => {
    jest.resetModules();
    logger = require('../utils/logger');
    consoleLogSpy = jest.spyOn(console, 'log');
    Object.values(mockChalk).forEach(mock => mock.mockClear());
    consoleLogSpy.mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('should format log prefix correctly', () => {
    const prefix = loggerModule.formatPrefix('INFO');
    expect(prefix).toBe('ℹ️ [2025-01-01T00:00:00.000Z] INFO    ');
    expect(mockChalk.blue).toHaveBeenCalled();
  });

  test('should log info messages', () => {
    loggerModule.info('Test info message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'ℹ️ [2025-01-01T00:00:00.000Z] INFO    ',
      'Test info message'
    );
  });

  test('should log success messages', () => {
    loggerModule.success('Test success message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '✅ [2025-01-01T00:00:00.000Z] SUCCESS ',
      'Test success message'
    );
  });

  test('should log warning messages', () => {
    loggerModule.warn('Test warning message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚠️ [2025-01-01T00:00:00.000Z] WARNING ',
      'Test warning message'
    );
  });

  test('should log error messages', () => {
    loggerModule.error('Test error message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '❌ [2025-01-01T00:00:00.000Z] ERROR  ',
      'Test error message'
    );
  });

  test('should log debug messages', () => {
    loggerModule.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '🔍 [2025-01-01T00:00:00.000Z] DEBUG  ',
      'Test debug message'
    );
  });

  test('should log system messages', () => {
    loggerModule.system('Test system message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚙️ [2025-01-01T00:00:00.000Z] SYSTEM ',
      'Test system message'
    );
  });

  test('should log git messages', () => {
    loggerModule.git('Test git message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '📦 [2025-01-01T00:00:00.000Z] GIT   ',
      'Test git message'
    );
  });

  test('should log file messages', () => {
    loggerModule.file('Test file message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '📄 [2025-01-01T00:00:00.000Z] FILE  ',
      'Test file message'
    );
  });

  test('should truncate long strings', () => {
    const longString = 'a'.repeat(600);
    loggerModule.info(longString);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'ℹ️ [2025-01-01T00:00:00.000Z] INFO    ',
      `${'a'.repeat(500)}⟪ 100 characters skipped ⟫`
    );
  });

  test('should format objects and arrays', () => {
    const obj = { key: 'value' };
    const formatted = loggerModule.formatValue(obj);
    expect(formatted).toContain('{\n  "key": "value"\n}');
  });

  test('should format multiline strings', () => {
    const multiline = 'line1\nline2\nline3';
    const formatted = loggerModule.formatValue(multiline);
    expect(formatted).toBe('\n  line1\n  line2\n  line3');
  });

  test('should format arrays with more than MAX_ARRAY_LENGTH items', () => {
    const longArray = Array.from({ length: 15 }, (_, i) => i);
    const formatted = loggerModule.formatValue(longArray);
    expect(formatted).toContain('... (5 more items)]');
  });
});
