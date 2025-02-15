const logger = require('../utils/logger');

describe('Logger', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('should truncate long strings', () => {
    const longString = 'a'.repeat(1000);
    const truncated = logger.truncate(longString, 100);
    expect(truncated).toContain('⟪');
    expect(truncated.length).toBeLessThan(longString.length);
  });

  test('should not truncate short strings', () => {
    const shortString = 'hello world';
    const result = logger.truncate(shortString);
    expect(result).toBe(shortString);
  });

  test('should handle non-string inputs', () => {
    const obj = { key: 'value', nested: { data: [1, 2, 3] } };
    const result = logger.truncate(obj);
    expect(result).toContain('key');
    expect(result).toContain('value');
  });

  test('should handle undefined input', () => {
    const result = logger.truncate(undefined);
    expect(result).toBe('undefined');
  });

  test('should handle null input', () => {
    const result = logger.truncate(null);
    expect(result).toBe('null');
  });

  test('should handle circular references', () => {
    const obj = { a: 1 };
    obj.self = obj;
    const result = logger.truncate(obj);
    expect(result).toContain('[');
    expect(result).toContain(']');
  });

  test('should format values correctly', () => {
    expect(logger.formatValue('test')).toBe('test');
    expect(logger.formatValue(123)).toBe('123');
    expect(logger.formatValue(true)).toBe('true');
    expect(logger.formatValue(null)).toBe('null');
    expect(logger.formatValue(undefined)).toBe('undefined');
    expect(logger.formatValue({ a: 1 })).toContain('a');
    expect(logger.formatValue([1, 2, 3])).toContain('1');
  });

  test('logging functions should not throw', () => {
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.success('test')).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
    expect(() => logger.debug('test')).not.toThrow();
    expect(() => logger.system('test')).not.toThrow();
    expect(() => logger.git('test')).not.toThrow();
    expect(() => logger.file('test')).not.toThrow();
  });
}); 