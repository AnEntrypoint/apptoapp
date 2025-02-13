const { diff } = require('../files');

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
