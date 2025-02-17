const { sum, product, makeApiRequest } = require('../utils');
const { createLLMProvider } = require('../llm/providers');

jest.mock('../llm/providers');

describe('utils', () => {
  test('should return the sum of two numbers', () => {
    expect(sum(1, 2)).toBe(3);
    expect(sum(-1, 1)).toBe(0);
    expect(sum(0, 0)).toBe(0);
  });

  test('should return the product of two numbers', () => {
    expect(product(2, 3)).toBe(6);
    expect(product(-2, 3)).toBe(-6);
    expect(product(0, 5)).toBe(0);
  });
});

describe('makeApiRequest', () => {
  const mockProvider = {
    makeRequest: jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'Test response'
        }
      }]
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createLLMProvider.mockReturnValue(mockProvider);
  });

  test('should use Mistral exclusively', async () => {
    await makeApiRequest([{ content: 'test' }], [], 'test-key', 'test-endpoint');
    expect(createLLMProvider).toHaveBeenCalledWith('test-key');
  });

  test('should handle API errors', async () => {
    mockProvider.makeRequest.mockRejectedValueOnce(new Error('API Error'));
    await expect(makeApiRequest([{ content: 'test' }], [], 'test-key', 'test-endpoint')).rejects.toThrow('API Error');
  });
});
