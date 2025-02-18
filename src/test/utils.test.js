const { makeApiRequest, sum, product } = require('../utils');
const { createLLMProvider } = require('../llm/providers');

jest.mock('../llm/providers');

describe('utils', () => {
  test('should return the sum of two numbers', () => {
    expect(sum(1, 2)).toBe(3);
  });

  test('should return the product of two numbers', () => {
    expect(product(2, 3)).toBe(6);
  });
});

describe('makeApiRequest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      MISTRAL_API_KEY: 'test-mistral-key',
      TOGETHER_API_KEY: 'test-together-key',
      OPENROUTER_API_KEY: 'test-openrouter-key',
      GROQ_API_KEY: 'test-groq-key'
    };
  });

  it('should use Mistral by default', async () => {
    const mockProvider = {
      makeRequest: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'success' } }]
      })
    };
    createLLMProvider.mockReturnValue(mockProvider);

    const result = await makeApiRequest([{ content: 'test' }], [], 'test-key');
    expect(createLLMProvider).toHaveBeenCalledWith('mistral', 'test-key', undefined);
    expect(result).toEqual({
      choices: [{ message: { content: 'success' } }]
    });
  });

  it('should follow the fallback chain when providers fail', async () => {
    const mockSuccessProvider = {
      makeRequest: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'success' } }]
      })
    };

    // Mock each provider to fail except the last one
    createLLMProvider
      .mockImplementationOnce(() => { throw new Error('Mistral failed'); })
      .mockImplementationOnce(() => { throw new Error('Together failed'); })
      .mockImplementationOnce(() => { throw new Error('OpenRouter failed'); })
      .mockReturnValue(mockSuccessProvider); // Groq succeeds

    const result = await makeApiRequest([{ content: 'test' }], [], 'test-key');

    expect(createLLMProvider).toHaveBeenCalledTimes(4);
    expect(createLLMProvider).toHaveBeenNthCalledWith(1, 'mistral', 'test-key', undefined);
    expect(createLLMProvider).toHaveBeenNthCalledWith(2, 'together', 'test-together-key', undefined);
    expect(createLLMProvider).toHaveBeenNthCalledWith(3, 'openrouter', 'test-openrouter-key', undefined);
    expect(createLLMProvider).toHaveBeenNthCalledWith(4, 'groq', 'test-groq-key', undefined);
    expect(result).toEqual({
      choices: [{ message: { content: 'success' } }]
    });
  });

  it('should throw error when all providers fail', async () => {
    createLLMProvider.mockImplementation(() => {
      throw new Error('Provider failed');
    });

    await expect(makeApiRequest([{ content: 'test' }], [], 'test-key'))
      .rejects
      .toThrow('Failed to get response from any available provider');
  });

  it('should skip providers with missing API keys', async () => {
    process.env = {
      MISTRAL_API_KEY: undefined,
      TOGETHER_API_KEY: undefined,
      OPENROUTER_API_KEY: 'test-openrouter-key',
      GROQ_API_KEY: undefined
    };

    const mockSuccessProvider = {
      makeRequest: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'success' } }]
      })
    };

    createLLMProvider.mockReturnValue(mockSuccessProvider);

    const result = await makeApiRequest([{ content: 'test' }], [], undefined);

    expect(createLLMProvider).toHaveBeenCalledTimes(1);
    expect(createLLMProvider).toHaveBeenCalledWith('openrouter', 'test-openrouter-key', undefined);
    expect(result).toEqual({
      choices: [{ message: { content: 'success' } }]
    });
  });
});
