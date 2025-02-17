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
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  it('should use Groq by default', async () => {
    await makeApiRequest([{ content: 'test' }], [], 'test-key');
    expect(createLLMProvider).toHaveBeenCalledWith('groq', 'test-key', undefined);
  });

  it('should fall back to Mistral if Groq fails', async () => {
    const mockProvider = {
      makeRequest: jest.fn()
    };
    mockProvider.makeRequest
      .mockRejectedValueOnce(new Error('Groq failed'))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'success' } }] });

    createLLMProvider
      .mockImplementationOnce(() => { throw new Error('Groq failed'); })
      .mockImplementationOnce(() => mockProvider);

    const result = await makeApiRequest([{ content: 'test' }], [], 'test-key');

    expect(createLLMProvider).toHaveBeenCalledTimes(2);
    expect(createLLMProvider).toHaveBeenNthCalledWith(1, 'groq', 'test-key', undefined);
    expect(createLLMProvider).toHaveBeenNthCalledWith(2, 'mistral', process.env.MISTRAL_API_KEY, undefined);
    expect(result).toEqual({ choices: [{ message: { content: 'success' } }] });
  });

  it('should handle API errors', async () => {
    const mockProvider = {
      makeRequest: jest.fn().mockRejectedValue(new Error('API Error'))
    };
    createLLMProvider.mockReturnValue(mockProvider);

    await expect(makeApiRequest([{ content: 'test' }], [], 'test-key'))
      .rejects
      .toThrow('API Error');
  });
});
