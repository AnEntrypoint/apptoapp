const logger = require('../utils/logger');

describe('logger', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('should log info messages', () => {
    logger.info('Test info message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('ℹ️'),
      'Test info message'
    );
  });

  test('should log success messages', () => {
    logger.success('Test success message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('✅'),
      'Test success message'
    );
  });

  test('should log warning messages', () => {
    logger.warn('Test warning message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('⚠️'),
      'Test warning message'
    );
  });

  test('should log error messages', () => {
    logger.error('Test error message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('❌'),
      'Test error message'
    );
  });

  test('should log debug messages', () => {
    logger.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('🔍'),
      'Test debug message'
    );
  });

  test('should log system messages', () => {
    logger.system('Test system message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('⚙️'),
      'Test system message'
    );
  });

  test('should log git messages', () => {
    logger.git('Test git message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('📦'),
      'Test git message'
    );
  });

  test('should log file messages', () => {
    logger.file('Test file message');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('📄'),
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
