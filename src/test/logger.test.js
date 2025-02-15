// Mock chalk before requiring logger
jest.doMock('chalk', () => ({
  blue: jest.fn(str => str),
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  red: jest.fn(str => str),
  gray: jest.fn(str => str),
  magenta: jest.fn(str => str),
  cyan: jest.fn(str => str),
  white: jest.fn(str => str)
}));

// Import logger after mocking chalk
const logger = require('../utils/logger');

describe('logger', () => {
  let consoleLogSpy;
  let originalConsoleLog;
  let originalDateToISOString;

  beforeAll(() => {
    originalConsoleLog = console.log;
    originalDateToISOString = Date.prototype.toISOString;
    // Mock Date.toISOString to return a fixed timestamp
    Date.prototype.toISOString = () => '2025-01-01T00:00:00.000Z';
  });

  beforeEach(() => {
    console.log = jest.fn();
    consoleLogSpy = console.log;
  });

  afterEach(() => {
    console.log.mockClear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    Date.prototype.toISOString = originalDateToISOString;
  });

  test('should format log prefix correctly', () => {
    const prefix = logger.formatPrefix('INFO');
    expect(prefix).toBe('ℹ️ [2025-01-01T00:00:00.000Z] INFO    ');
  });

  test('should log info messages', () => {
    logger.info('Test info message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'ℹ️ [2025-01-01T00:00:00.000Z] INFO    ',
      'Test info message'
    );
  });

  test('should log success messages', () => {
    logger.success('Test success message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '✅ [2025-01-01T00:00:00.000Z] SUCCESS ',
      'Test success message'
    );
  });

  test('should log warning messages', () => {
    logger.warn('Test warning message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚠️ [2025-01-01T00:00:00.000Z] WARNING ',
      'Test warning message'
    );
  });

  test('should log error messages', () => {
    logger.error('Test error message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '❌ [2025-01-01T00:00:00.000Z] ERROR  ',
      'Test error message'
    );
  });

  test('should log debug messages', () => {
    logger.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '🔍 [2025-01-01T00:00:00.000Z] DEBUG  ',
      'Test debug message'
    );
  });

  test('should log system messages', () => {
    logger.system('Test system message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚙️ [2025-01-01T00:00:00.000Z] SYSTEM ',
      'Test system message'
    );
  });

  test('should log git messages', () => {
    logger.git('Test git message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '📦 [2025-01-01T00:00:00.000Z] GIT   ',
      'Test git message'
    );
  });

  test('should log file messages', () => {
    logger.file('Test file message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '📄 [2025-01-01T00:00:00.000Z] FILE  ',
      'Test file message'
    );
  });

  test('should truncate long strings', () => {
    const longString = 'a'.repeat(1000);
    const truncated = logger.truncate(longString);
    expect(truncated).toContain('⟪ 500 characters skipped ⟫');
  });

  test('should format objects and arrays', () => {
    const obj = { key: 'value' };
    const formatted = logger.formatValue(obj);
    expect(formatted).toContain('{\n  "key": "value"\n}');
  });

  test('should format multiline strings', () => {
    const multiline = 'line1\nline2\nline3';
    const formatted = logger.formatValue(multiline);
    expect(formatted).toBe('\n  line1\n  line2\n  line3');
  });

  test('should format arrays with more than MAX_ARRAY_LENGTH items', () => {
    const longArray = Array.from({ length: 15 }, (_, i) => i);
    const formatted = logger.formatValue(longArray);
    expect(formatted).toContain('... (5 more items)]');
  });
});
