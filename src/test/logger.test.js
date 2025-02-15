
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
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('ℹ️ [INFO]'), 'Test info message');
  });

  test('should log success messages', () => {
    logger.success('Test success message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ [SUCCESS]'), 'Test success message');
  });

  test('should log warning messages', () => {
    logger.warn('Test warning message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️ [WARNING]'), 'Test warning message');
  });

  test('should log error messages', () => {
    logger.error('Test error message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ [ERROR]'), 'Test error message');
  });

  test('should log debug messages', () => {
    logger.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🔍 [DEBUG]'), 'Test debug message');
  });

  test('should log system messages', () => {
    logger.system('Test system message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('⚙️ [SYSTEM]'), 'Test system message');
  });

  test('should log git messages', () => {
    logger.git('Test git message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📦 [GIT]'), 'Test git message');
  });

  test('should log file messages', () => {
    logger.file('Test file message');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📄 [FILE]'), 'Test file message');
  });

  test('should truncate long strings', () => {
    const longString = 'a'.repeat(1000);
    const truncated = logger.truncate(longString);
    expect(truncated).toContain('⟪ 490 characters skipped ⟫');
  });

  test('should format objects and arrays', () => {
    const obj = { key: 'value' };
    const formatted = logger.formatValue(obj);
    expect(formatted).toContain('{\n  "key": "value"\n}');
  });
});
