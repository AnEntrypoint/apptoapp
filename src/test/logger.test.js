// Mock chalk before requiring logger
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

describe('logger', () => {
  let consoleLogSpy;
  let originalConsoleLog;
  let originalDateToISOString;
  let logger;

  beforeAll(() => {
    originalConsoleLog = console.log;
    originalDateToISOString = Date.prototype.toISOString;
    // Mock Date.toISOString to return a fixed timestamp
    Date.prototype.toISOString = () => '2025-01-01T00:00:00.000Z';
  });

  beforeEach(() => {
    jest.isolateModules(() => {
      logger = require('../utils/logger');
    });
    console.log = jest.fn();
    consoleLogSpy = console.log;
  });

  afterEach(() => {
    console.log.mockClear();
    Object.values(mockChalk).forEach(mock => mock.mockClear());
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    Date.prototype.toISOString = originalDateToISOString;
  });

  test('should format log prefix correctly', () => {
    const prefix = logger.formatPrefix('INFO');
    expect(prefix).toBe('ℹ️ [2025-01-01T00:00:00.000Z] INFO    ');
    expect(mockChalk.blue).toHaveBeenCalled();
  });

  test('should log info messages', () => {
    logger.info('Test info message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'ℹ️ [2025-01-01T00:00:00.000Z] INFO    ',
      'Test info message'
    );
    expect(mockChalk.blue).toHaveBeenCalled();
  });

  test('should log success messages', () => {
    logger.success('Test success message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '✅ [2025-01-01T00:00:00.000Z] SUCCESS ',
      'Test success message'
    );
    expect(mockChalk.green).toHaveBeenCalled();
  });

  test('should log warning messages', () => {
    logger.warn('Test warning message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚠️ [2025-01-01T00:00:00.000Z] WARNING ',
      'Test warning message'
    );
    expect(mockChalk.yellow).toHaveBeenCalled();
  });

  test('should log error messages', () => {
    logger.error('Test error message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '❌ [2025-01-01T00:00:00.000Z] ERROR  ',
      'Test error message'
    );
    expect(mockChalk.red).toHaveBeenCalled();
  });

  test('should log debug messages', () => {
    logger.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '🔍 [2025-01-01T00:00:00.000Z] DEBUG  ',
      'Test debug message'
    );
    expect(mockChalk.gray).toHaveBeenCalled();
  });

  test('should log system messages', () => {
    logger.system('Test system message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '⚙️ [2025-01-01T00:00:00.000Z] SYSTEM ',
      'Test system message'
    );
    expect(mockChalk.magenta).toHaveBeenCalled();
  });

  test('should log git messages', () => {
    logger.git('Test git message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '📦 [2025-01-01T00:00:00.000Z] GIT   ',
      'Test git message'
    );
    expect(mockChalk.cyan).toHaveBeenCalled();
  });

  test('should log file messages', () => {
    logger.file('Test file message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '📄 [2025-01-01T00:00:00.000Z] FILE  ',
      'Test file message'
    );
    expect(mockChalk.white).toHaveBeenCalled();
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
