const { transform } = require('../transform');

describe('transform', () => {
  test('should transform input according to the specified instruction', () => {
    expect(transform('input', 'uppercase')).toBe('INPUT');
    expect(transform('input', 'lowercase')).toBe('input');
    expect(transform('input', 'reverse')).toBe('tupni');
  });

  test('should handle unknown instructions', () => {
    expect(() => transform('input', 'unknown')).toThrow('Unknown instruction: unknown');
  });
});
