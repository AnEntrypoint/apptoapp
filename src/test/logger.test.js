// Mock chalk
jest.mock('chalk', () => ({
  blue: (str) => str,
  green: (str) => str,
  yellow: (str) => str,
  red: (str) => str,
  gray: (str) => str,
  magenta: (str) => str,
  cyan: (str) => str,
  white: (str) => str
}));

describe('logger', () => {
  let consoleLogSpy;
  let originalConsoleLog;
  let logger;

  beforeAll(() => {
    originalConsoleLog = console.log;
  });

  beforeEach(() => {
    // Clear the module cache and reload the logger
    jest.resetModules();
    console.log = jest.fn();
    consoleLogSpy = console.log;
    logger = require('../utils/logger');
  });

  afterEach(() => {
    console.log.mockClear();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
  });

  test('should log info messages', () => {
    logger.info('Test info message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/ℹ️.*INFO/),
      'Test info message'
    );
  });

  test('should log success messages', () => {
    logger.success('Test success message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/✅.*SUCCESS/),
      'Test success message'
    );
  });

  test('should log warning messages', () => {
    logger.warn('Test warning message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/⚠️.*WARNING/),
      'Test warning message'
    );
  });

  test('should log error messages', () => {
    logger.error('Test error message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/❌.*ERROR/),
      'Test error message'
    );
  });

  test('should log debug messages', () => {
    logger.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/🔍.*DEBUG/),
      'Test debug message'
    );
  });

  test('should log system messages', () => {
    logger.system('Test system message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/⚙️.*SYSTEM/),
      'Test system message'
    );
  });

  test('should log git messages', () => {
    logger.git('Test git message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/📦.*GIT/),
      'Test git message'
    );
  });

  test('should log file messages', () => {
    logger.file('Test file message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/📄.*FILE/),
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
